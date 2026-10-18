#define MINIAUDIO_IMPLEMENTATION

#ifndef APPLICATION_ID
#define APPLICATION_ID 1539558939463786516
#endif

// standard library
#include <algorithm>
#include <array>
#include <atomic>
#include <cstdint>
#include <filesystem>
#include <functional>
#include <memory>
#include <print>
#include <string>
#include <string_view>
#include <thread>
#include <type_traits>
#include <utility>
#include <vector>
#include <cstddef>
#include <cstdlib>
#include <pwd.h>
#include <unistd.h>

// third party
#include <coco/stray/stray.hpp>
#include <saucer/embedded/all.hpp>
#include <saucer/app.hpp>
#include <saucer/executor.hpp>
#include <saucer/smartview.hpp>
#include <saucer/window.hpp>

#if !defined(YUGEN_WEBKITGTK)
#include <QDir>
#include <QGuiApplication>
#include <QLocalServer>
#include <QLocalSocket>
#include <QLockFile>
#include <QScreen>
#include <QStandardPaths>
#include <QThread>
#endif

// project
#include "miniaudio.h"
#include "mpris.h"
#include "services.h"

namespace fs = std::filesystem;

using mm = yugen::MusicManager;
using sm = yugen::SoundManager;
using st = yugen::Settings;
using pf = yugen::Profile;
using co = yugen::Core;


namespace
{
     // the entry point of the bundle baked in by saucer_embed(), served from
     // memory rather than fetched over http - there is no server to point at.
     // the leading slash matters: it becomes the path of a saucer:// url, and
     // the embedded files are keyed by exactly that path
     constexpr const char* UI_ENTRY = "/index.html";

     constexpr int WINDOW_MIN_WIDTH = 900;
     constexpr int WINDOW_MIN_HEIGHT = 720;

     /*
      * expose_async
      *
      * Anything that touches the disk, the network or yt-dlp would freeze the
      * window if it ran on the ui thread, so it is moved to a worker thread and
      * answered later through saucer's executor, which resolves the javascript
      * promise on the other side of the bridge.
      *
      * That wrapping is the same every time, so instead of repeating it in every
      * binding it is written once here and the bindings only say what the work is:
      *
      *     expose_async(webview, "next", [] { return sm::next_song(); });
      *
      * How it works: async_binding reads the argument and return types straight
      * off the lambda's operator(), and make_async builds a second lambda that
      * takes those same arguments plus the executor saucer wants as the last
      * parameter. Whatever the lambda returns is what the promise resolves with;
      * returning void resolves an empty one.
      */
     template <typename Result, typename... Args, typename Fn>
     auto make_async(Fn fn)
     {
          return [fn = std::move(fn)](Args... args, saucer::executor<Result> exec)
          {
               std::thread worker{[fn, ...args = std::move(args), exec = std::move(exec)]() mutable
               {
                    if constexpr(std::is_void_v<Result>)
                    {
                         fn(std::move(args)...);
                         exec.resolve();
                    }
                    else
                    {
                         exec.resolve(fn(std::move(args)...));
                    }
               }};

               worker.detach();
          };
     }

     // reads the argument and return types back off the lambda's call operator
     template <typename Fn>
     struct async_binding : async_binding<decltype(&Fn::operator())> { };

     template <typename Class, typename Result, typename... Args>
     struct async_binding<Result (Class::*)(Args...) const>
     {
          template <typename Fn>
          static auto wrap(Fn fn)
          {
               return make_async<Result, Args...>(std::move(fn));
          }
     };

     void expose_async(auto& webview, const std::string& name, auto fn)
     {
          webview->expose(name, async_binding<decltype(fn)>::wrap(std::move(fn)));
     }

     /*
      * run_js
      *
      * execute() takes a saucer::cstring_view, and building one is enough for gcc
      * to escalate the enclosing lambda into an immediate function - which then
      * cannot be stored in the std::function the mpris handler is. Wrapping the
      * call in a plain function keeps that out of the lambda; it has to stay a
      * non-template so the escalation cannot simply follow it here.
      */
     void run_js(saucer::webview& view, const std::string& script)
     {
          view.execute(script);
     }

     /*
      * The audio tap
      *
      * The sound never passes through the page - miniaudio plays it from here -
      * so for the ui to draw it, this side keeps the last moment of what the
      * engine mixed. onProcess fires on the audio thread at the end of every
      * block the device pulls, with the finished frames; they are folded to
      * mono into a ring that get_audio_frames reads the newest of.
      *
      * The audio thread must never wait on the ui, so there is no lock: every
      * slot is an atomic float and the write position is published after the
      * slots. A read racing a write can pick up a few samples of the next
      * block, which nothing drawn from a spectrum can show.
      */
     constexpr std::size_t TAP_SIZE = 8192;

     std::array<std::atomic<float>, TAP_SIZE> tap_ring{};
     std::atomic<std::uint64_t> tap_written{0};

     void tap_process(void* user, float* frames, ma_uint64 count)
     {
          const ma_uint32 channels = ma_engine_get_channels(static_cast<ma_engine*>(user));
          std::uint64_t at = tap_written.load(std::memory_order_relaxed);

          if(channels == 0) return;

          for(ma_uint64 i = 0; i < count; i++, at++)
          {
               float sum = 0.0f;
               for(ma_uint32 c = 0; c < channels; c++) sum += frames[i * channels + c];

               tap_ring[at % TAP_SIZE].store(sum / static_cast<float>(channels), std::memory_order_relaxed);
          }

          tap_written.store(at, std::memory_order_release);
     }

     // the newest `count` frames, oldest first, each times `gain`
     std::vector<float> tap_read(std::size_t count, float gain)
     {
          count = std::min(count, TAP_SIZE);

          const std::uint64_t end = tap_written.load(std::memory_order_acquire);
          const std::uint64_t start = end > count ? end - count : 0;

          std::vector<float> out;
          out.reserve(count);

          for(std::uint64_t at = start; at < end; at++)
          {
               out.push_back(tap_ring[at % TAP_SIZE].load(std::memory_order_relaxed) * gain);
          }

          return out;
     }

#if !defined(YUGEN_WEBKITGTK)
     /*
      * One yugen at a time
      *
      * A second launch - a key bound to the player and pressed again, a .desktop
      * entry clicked while it is already up - would otherwise be a second window
      * playing over the first. The first to start holds a lock file and listens
      * on a local socket (a named pipe on windows); a later one finds the lock
      * taken, asks the holder to come forward, and leaves before it has made a
      * window of its own.
      *
      * The lock is what makes it hold under a key held down: launches landing in
      * the same instant would each find nobody listening on the socket and all
      * stay. Only the one with the lock may listen.
      */
     struct instance
     {
          std::unique_ptr<QLockFile> lock;
          std::unique_ptr<QLocalServer> server;
     };

     // true: this process is the player. false: another one is, and has been
     // asked to show itself
     bool claim_instance(instance& self, std::function<void()> on_raise)
     {
          const QString name = QStringLiteral("yugen-") + QDir::home().dirName();
          const QString temp = QStandardPaths::writableLocation(QStandardPaths::TempLocation);

          self.lock = std::make_unique<QLockFile>(QDir{temp}.filePath(name + QStringLiteral(".lock")));
          // the holder's pid alone says whether a lock is stale - one left by a
          // crash is taken over. by age (the default, 30 s) a player that had
          // been running for a minute would look abandoned
          self.lock->setStaleLockTime(0);

          if(!self.lock->tryLock(0))
          {
               // the holder may still be on its way up: give it two seconds to listen
               for(int attempt = 0; attempt < 20; attempt++)
               {
                    QLocalSocket socket;
                    socket.connectToServer(name);

                    if(socket.waitForConnected(100))
                    {
                         socket.write("raise\n");
                         socket.waitForBytesWritten(500);
                         socket.disconnectFromServer();

                         return false;
                    }

                    QThread::msleep(100);
               }

               // a lock is held and nothing answers: still not a second window
               std::println("[WARN] another yugen holds the instance lock but does not answer");
               return false;
          }

          // a socket file a crashed player left behind would refuse the listen
          QLocalServer::removeServer(name);

          self.server = std::make_unique<QLocalServer>();
          self.server->setSocketOptions(QLocalServer::UserAccessOption);

          QObject::connect(self.server.get(), &QLocalServer::newConnection, [server = self.server.get(), on_raise = std::move(on_raise)] {
               while(auto* socket = server->nextPendingConnection())
               {
                    QObject::connect(socket, &QLocalSocket::disconnected, socket, &QObject::deleteLater);
                    on_raise();
               }
          });

          if(!self.server->listen(name))
          {
               std::println("[WARN] could not listen for a second launch: {}", self.server->errorString().toStdString());
          }

          return true;
     }
#endif
}

coco::stray start(saucer::application* app)
{
#if !defined(YUGEN_WEBKITGTK)
     // a second launch brings this window forward; the window is made below,
     // after the claim, so the call goes through a slot filled in once it is
     std::function<void()> raise_window = [] {};
     instance single;

     if(!claim_instance(single, [&raise_window] { raise_window(); }))
     {
          app->quit();
          co_return;
     }
#endif

     auto window = saucer::window::create(app).value();
     /*
      * QtWebEngine renders offscreen and hands each frame to Qt, so chromium
      * never sees the display's vsync and paces itself with a fixed 60 fps
      * timer. Without the limit it draws the next frame as soon as Qt has taken
      * the last one, and Qt takes them at the monitor's rate - 165 Hz here.
      * (saucer sets QTWEBENGINE_CHROMIUM_FLAGS itself, so this is the only way in.)
      */
     auto webview = saucer::smartview::create({
          .window = window,
          .browser_flags = {"--disable-frame-rate-limit"},
     });

     ma_engine engine;

     // the tap above sees every block the engine finishes
     ma_engine_config engine_config = ma_engine_config_init();
     engine_config.onProcess = tap_process;
     engine_config.pProcessUserData = &engine;

     const ma_result res = ma_engine_init(&engine_config, &engine);
     if(res != MA_SUCCESS)
     {
          std::println("[ERROR] Engine init failed: {}", static_cast<int>(res));
     }

     fs::create_directories(yugen::config_dir());
     // after the directory, not before: init() writes the last.fm key into it
     // and an ofstream will not make the path itself
     mm::init();

     window->set_title("yugen");

     // the webkit menu can't be edited, so it is turned off and drawn in the ui instead
     webview->set_context_menu(false);

     yugen::start_discord(APPLICATION_ID);

     /*
      * MPRIS. The interface is what every panel, lock screen and media key on
      * the desktop reads a player through, so without it yugen plays to itself:
      * nothing outside the process can see the track or reach the transport.
      *
      * The state it publishes is pushed in by the ui through the three bindings
      * below, and the controls that come back the other way are handed to the
      * page rather than to SoundManager. That is not a detour - the queue, the
      * paused flag and the tags all live on the react side, and calling the
      * backend behind its back would leave the window showing the wrong thing.
      *
      * The callback runs on the glib main loop, which is the same thread the
      * window is on, and execute() is thread safe regardless.
      */
     yugen::mpris::start([&](std::string_view cmd, double arg) {
          if(cmd == "raise")
          {
               window->show();
               window->set_minimized(false);
               window->focus();

               return;
          }

          if(cmd == "quit")
          {
               app->quit();
               return;
          }

          // the page registers the receiving end on the way up; until it does,
          // the optional call simply drops the control
          const std::string call = "window.__yugen_mpris?.('" + std::string{cmd} + "', " + std::to_string(arg) + ")";

          run_js(*webview, call);
     });

     /*
      * Playback control. miniaudio only flips state on a sound that is already
      * loaded, so these return in microseconds and answer on the ui thread
      * directly. seek() is the exception - it can pull new frames from the file.
      */
     webview->expose("play_music", [&](const std::string& file_path, const std::string& title,
          const std::string& artist, const std::string& album) {
          sm::play(&engine, file_path, title, artist, album);
     });

     webview->expose("resume", [] {
          sm::resume();
     });

     webview->expose("stop", [] {
          sm::stop();
     });

     webview->expose("toggle_loop", [](bool state) {
          std::println("[INFO] Toggle loop: {}", state);
          sm::toggle_loop();
     });

     expose_async(webview, "seek", [](float position) {
          sm::seek(position);
     });
     
     expose_async(webview, "get_playlist_count", []() {
          return co::get_playlist_count();
     });

     // polled by the ui while a track runs, so these stay synchronous and cheap
     webview->expose("get_position", []() -> float {
          return sm::get_pos();
     });

     webview->expose("get_length", []() -> float {
          return sm::get_len();
     });

     webview->expose("is_finished", []() -> bool {
          return sm::is_finished();
     });

     /*
      * What the engine just played, for the wave and the field behind the
      * pages - ui/src/lib/audio.ts does the fft. Copying a couple of thousand
      * floats out of the tap takes microseconds, so these answer on the ui
      * thread like the pollers above.
      *
      * The volume is divided back out: the slider is there to make the music
      * quieter, not the picture of it.
      */
     webview->expose("get_audio_frames", [](int count) -> std::vector<float> {
          const float volume = std::max(sm::load_volume(), 0.05f);
          return tap_read(static_cast<std::size_t>(std::max(count, 0)), 1.0f / volume);
     });

     webview->expose("get_sample_rate", [&engine]() -> float {
          return static_cast<float>(ma_engine_get_sample_rate(&engine));
     });

     /*
      * Queue. next/prev only return the file name of the neighbouring track;
      * the ui decides what to do with it and calls play_music itself.
      */
     expose_async(webview, "next", [] {
          return sm::next_song();
     });

     expose_async(webview, "prev", [] {
          return sm::prev_song();
     });

     expose_async(webview, "shuffle", [](std::vector<std::string> songs) {
          std::println("[INFO] Shuffled songs");
          return mm::shuffle_songs(songs);
     });

     /*
      * The library on disk. These read files, so they are called once per track
      * when a folder is opened and the results are kept on the ui side.
      *
      * They go out async like everything else that touches the disk: a scan is
      * one taglib read and one cover per track, and on the ui thread that was
      * the window frozen for as long as the whole folder took.
      */
     expose_async(webview, "fetch_songs", [](std::string file_path) {
          std::println("[INFO] Fetching songs on {}", file_path);
          return sm::fetch_songs(file_path);
     });

     expose_async(webview, "get_metadata", [](std::string file_path) {
          std::println("[INFO] Get metadata: {}", file_path);
          return sm::get_metadata(file_path);
     });

     expose_async(webview, "get_cover", [](std::string file_path) {
          std::println("[INFO] Get cover: {}", file_path);
          return co::get_cover(file_path);
     });

     expose_async(webview, "delete_song", [](std::string file_path) {
          std::println("[INFO] Deleted song: {}", file_path);
          sm::delete_song(file_path);
     });

     /*
      * Search and download. Every one of these starts a yt-dlp process and waits
      * for it, which takes seconds for a search and minutes for a download, so
      * they all go through expose_async.
      */
     expose_async(webview, "search_yt", [](std::string query, int count) {
          std::println("[INFO] Searching on youtube - query: {}", query);
          return co::search_youtube(query, count);
     });

     expose_async(webview, "search_sc", [](std::string query, int count) {
          std::println("[INFO] Searching on sound cloud - query: {}", query);
          return co::search_sound_cloud(query, count);
     });

     expose_async(webview, "download_yt", [](std::string id, std::string output_path) {
          std::println("[INFO] Download from youtube - id: {}", id);
          return co::download_from_yt(id, output_path);
     });

     expose_async(webview, "download_sc", [](std::string url, std::string output_path) {
          std::println("[INFO] Download from sound cloud - url: {}", url);
          return co::download_from_sc(url, output_path);
     });

     /*
      * Liked songs, stored as a flat array of file names in liked_songs.json.
      */
     expose_async(webview, "get_liked_songs", [] {
          std::println("[INFO] Fetched liked songs");
          return mm::get_liked_songs();
     });

     expose_async(webview, "like_song", [](std::string song_name) {
          std::println("[INFO] Liked song: {}", song_name);
          mm::like_song(song_name);
     });

     expose_async(webview, "unlike_song", [](std::string song_name) {
          std::println("[INFO] Unliked song: {}", song_name);
          mm::unlike_song(song_name);
     });

     /*
      * Playlists. The sidebar asks for the names, opening one asks for its tracks,
      * and the mutating calls answer with a bool the ui uses to decide whether to
      * refresh the list.
      */
     expose_async(webview, "get_playlists", [] {
          return mm::get_playlists();
     });

     expose_async(webview, "get_playlist", [](std::string playlist_name) {
          return mm::get_playlist(playlist_name);
     });

     expose_async(webview, "create_playlist", [](std::string playlist_name) {
          std::println("[INFO] Create playlist: {}", playlist_name);
          return mm::create_playlist(playlist_name);
     });

     expose_async(webview, "delete_playlist", [](std::string playlist_name) {
          std::println("[INFO] Delete playlist: {}", playlist_name);
          return mm::delete_playlist(playlist_name);
     });

     expose_async(webview, "rename_playlist", [](std::string playlist_name, std::string new_playlist_name) {
          std::println("[INFO] Rename playlist: {} -> {}", playlist_name, new_playlist_name);
          return mm::rename_playlist(playlist_name, new_playlist_name);
     });

     expose_async(webview, "add_to_playlist", [](std::string playlist_name, std::string file_path) {
          std::println("[INFO] Add {} to {}", file_path, playlist_name);
          return mm::add_to_playlist(playlist_name, file_path);
     });

     expose_async(webview, "remove_from_playlist", [](std::string playlist_name, std::string file_path) {
          std::println("[INFO] Delete {} from {}", file_path, playlist_name);
          return mm::remove_from_playlist(playlist_name, file_path);
     });

     /*
      * Lyrics, fetched from lrclib. The panel gets the raw sheet back and does
      * its own parsing, timed or not.
      */
     expose_async(webview, "get_lyrics", [](std::string title, std::string artist) {
          std::println("[INFO] Fetching lyrics for {} - {}", title, artist);
          return co::get_lyrics(title, artist);
     });

     expose_async(webview, "get_username", [](){
          return pf::get_username();
     });

     expose_async(webview, "get_biography", [](){
          return pf::get_biography();
     });
     
     expose_async(webview, "get_profile_picture", [](){
          return pf::get_profile_picture();
     });
     
     expose_async(webview, "get_favorite_songs", [](){
          return pf::get_favorite_songs();
     });

     expose_async(webview, "set_username", [](std::string username){
          return pf::set_username(username);
     });
     
     expose_async(webview, "set_biography", [](std::string bio){
          return pf::set_biography(bio);
     });

     expose_async(webview, "set_profile_picture", [](std::string img_path){
          return pf::set_profile_picture(img_path);
     });
     
     expose_async(webview, "add_favorite_song", [](yugen::TrackInfo track){
          return pf::add_favorite_song(track);
     });
     
     expose_async(webview, "remove_from_favorites", [](std::string file_path){
          return pf::remove_from_favorites(file_path);
     });
     /*
      * Discord. Both of these only touch a flag: the presence thread is started
      * at launch and keeps running either way, it just stops being told about
      * track changes while sharing is off. The getter is what the ui reads on
      * startup to draw the switch in the right position, since the setting lives
      * on this side and not in the page.
      */
     webview->expose("set_activity", [](bool state) -> void {
          yugen::set_activity(state);
          std::println("[INFO] Share activity on discord: {}", state);
     });

     webview->expose("set_volume", [](float vol) -> void {
          sm::set_volume(vol);
     });

     /*
      * The ui half of MPRIS. mpris_track carries the cover as the same base64
      * the page already holds, so it is only called when the track changes;
      * mpris_state rides the one second poller that already drives the progress
      * bar, and mpris_seeked is for the jumps that poller would otherwise
      * smear over a second.
      */
     webview->expose("mpris_track", [](const std::string& title, const std::string& artist,
          const std::string& album, const std::string& file_path, const std::string& cover) {
          yugen::mpris::update_track(title, artist, album, file_path, cover);
     });

     webview->expose("mpris_state", [](bool playing, float position, float length, float volume,
          bool can_next, bool can_prev, bool loop, bool shuffle) {
          yugen::mpris::update_state(playing, position, length, volume, can_next, can_prev, loop, shuffle);
     });

     webview->expose("mpris_seeked", [](float position) {
          yugen::mpris::seeked(position);
     });

     webview->expose("get_activity", [] ->bool {
          return yugen::get_activity();
     });

     webview->expose("load_volume", [] -> float {
          return sm::load_volume();
     });

#if !defined(YUGEN_WEBKITGTK)
     // the display's refresh rate. chromium's own frame limit is off (see the
     // webview above), so the ui paces itself to this - 165 Hz here - rather
     // than drawing as fast as frames are taken
     webview->expose("get_refresh_rate", [] -> float {
          const auto* screen = QGuiApplication::primaryScreen();
          return screen ? static_cast<float>(screen->refreshRate()) : 60.0f;
     });
#endif

     webview->expose("get_music_dir", [] -> std::string{
          passwd* p = getpwuid(getuid());
          if(p) {
               fs::create_directories(std::string(p->pw_dir) + "/Music" );
               return std::string(p->pw_dir) + "/Music";
          }
          return "";
     });

     // both of these end in a request to last.fm, so they go out async: the ui
     // fires a handful at a time and the window stays live through them
     expose_async(webview, "get_similar", [](std::string file_path, int limit){
          return mm::get_similar(file_path, limit);
     });

     expose_async(webview, "get_info", [](std::string artist, std::string track_name){
          return mm::get_info(artist, track_name);
     });

     expose_async(webview,"get_playlist_cover", [](std::string playlist_name){
          return mm::get_playlist_cover(playlist_name);
     });

     expose_async(webview,"set_playlist_cover", [](std::string playlist_name, std::string base64_pic){
          return mm::set_or_update_playlist_cover(playlist_name, base64_pic);
     });

     expose_async(webview,"set_keybind", [](std::string key, std::string value){
          return st::set(key, value);
     });

     expose_async(webview,"remove_keybind", [](std::string key){
          return st::remove(key);
     });
     
     expose_async(webview, "get_keybind", [](std::string key){
          return st::get(key);
     });

     expose_async(webview, "get_all_keybinds", []{
          return st::get_all();
     });

     expose_async(webview, "update_track_cover", [](std::string file_path, std::string base64_img){
          return mm::update_track_cover(file_path, base64_img);
     });

     /*
      * The window is set up last, once every binding exists, so the page cannot
      * load and call into a function that has not been exposed yet.
      */
     webview->embed(saucer::embedded::all());
     webview->serve(UI_ENTRY);
     window->set_min_size({WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT});
     window->set_maximized(true);
     window->set_decorations(saucer::window::decoration::none);
     window->show();

#if !defined(YUGEN_WEBKITGTK)
     raise_window = [&window] {
          window->show();
          window->set_minimized(false);
          window->focus();
     };
#endif

     co_await app->finish();

     yugen::mpris::stop();
     yugen::stop_discord();
     ma_engine_uninit(&engine);
}

int main()
{
     /*
      * WebKitGTK's native Wayland renderer can corrupt its buffers and crash in
      * NVIDIA's EGL driver, so that build is sent to XWayland instead. It only
      * applies when saucer is built on WebKitGtk: the Qt backend draws through
      * chromium, which has no such fault and needs native Wayland to keep the
      * display's own refresh rate. YUGEN_NATIVE_WAYLAND is the escape hatch for
      * a driver/WebKit combination where the native path is known to be fixed.
      */
#if !defined(YUGEN_WEBKITGTK)
     /*
      * QtWebEngine keeps chromium off its gbm path on nvidia and composites
      * through vulkan instead, which costs a core at 165 Hz: every frame goes
      * through the viz compositor on the cpu. On gbm it is the zero-copy path
      * and the same frames cost a few percent. Qt calls the switch a debugging
      * one; it is left alone when the environment has already set it either way.
      */
     ::setenv("QTWEBENGINE_FORCE_USE_GBM", "1", 0);
#endif

#if defined(YUGEN_WEBKITGTK)
     const char* session = std::getenv("XDG_SESSION_TYPE");
     const bool nvidia_wayland = session && std::string_view{session} == "wayland"
          && std::getenv("DISPLAY")
          && fs::exists("/proc/driver/nvidia/version");

     if(nvidia_wayland && !std::getenv("YUGEN_NATIVE_WAYLAND"))
     {
          ::setenv("GDK_BACKEND", "x11", 1);
     }
#endif

     return saucer::application::create({.id = "yugen"})->run(start);
}
