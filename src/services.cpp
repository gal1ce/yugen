// standard library
#include <algorithm>
#include <array>
#include <atomic>
#include <cctype>
#include <chrono>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <exception>
#include <filesystem>
#include <format>
#include <functional>
#include <fstream>
#include <memory>
#include <mutex>
#include <optional>
#include <print>
#include <random>
#include <set>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

// posix
#include <pwd.h>
#include <unistd.h>

// third party
#include <curl/curl.h>
#include <discord-rpc.hpp>
#include <nlohmann/json.hpp>
#include <taglib/attachedpictureframe.h>
#include <taglib/audioproperties.h>
#include <taglib/fileref.h>
#include <taglib/id3v2tag.h>
#include <taglib/mpegfile.h>
#include <taglib/tag.h>
#include <taglib/taglib.h>
#include <taglib/tfile.h>

// project
#include "miniaudio.h"
#include "services.h"

namespace fs = std::filesystem;

/*
 * Tracing for the caches below, compiled out of a release build entirely -
 * DEBUG is only defined on a Debug configuration, and then DBG expands to
 * nothing at all rather than to a call nobody reads. What it is for is the
 * question none of these caches can answer from the outside: whether an answer
 * came off disk or off the network. The [INFO] lines around them are printed by
 * the saucer bindings before the call is made, so they say a question was asked
 * and nothing about where it was answered.
 *
 * ##__VA_ARGS__ is a gnu extension, and what lets DBG take a bare format string
 * with no arguments after it.
 */
#ifdef DEBUG
     #define DBG(fmt, ...) std::println("[DEBUG] " fmt, ##__VA_ARGS__)
#else
     #define DBG(fmt, ...)
#endif

namespace yugen
{
     namespace
     {
          constexpr const char* SETTINGS_FILE    = "/settings.json";
          constexpr const char* PLAYLISTS_FILE   = "/playlists.json";
          // every sheet lrclib has ever answered with, so the second run of the
          // player is not the first one again
          constexpr const char* LYRICS_FILE      = "/lyrics.json";
          // and every answer last.fm has given about a track, for the same
          // reason: a shelf drawn a second time asks for each card once
          constexpr const char* INFO_FILE        = "/info.json";
          // the one grey star last.fm answers with for everything it has no
          // picture of, recognised by the hash in its url so that a suggestion
          // carrying nothing is handed over as carrying nothing
          constexpr const char* PLACEHOLDER      = "2a96cbd8b46e442fc41c2b86b821562f";
          // where the last.fm key is kept once it has been seen once, beside
          // everything else the player owns. plain text rather than json: it is
          // one line, and install.sh writes it too.
          constexpr const char* API_KEY_FILE     = "/lastfm_key"; 
          constexpr const char* PROFILE_FILE     = "/profile.json";
          constexpr const char* LIKED_SONGS_FILE = "/liked_songs.json";
          constexpr const char* COVERS_FILE      = "/covers.json";
          constexpr const char* CUSTOM_COVERS    = "/custom_covers.json";
          // a title of the listener's own for a track, by its full path, shown
          // in place of the one in its tags - in the ui and on discord. the
          // file itself is never written
          constexpr const char* CUSTOM_TITLES    = "/custom_titles.json";
          // the cloudinary account covers are put up on, so discord can fetch
          // a picture that only exists on this machine: name, api_key and
          // secret_key. written by hand; without it nothing is uploaded
          constexpr const char* CLOUDINARY_FILE  = "/cloudinary.json";
          // what has been put up there already: a key (the picture's sha1, or
          // the file a tag cover came out of) -> its url. an empty url is a
          // track with no picture of its own to put up, kept so it is not
          // read again
          constexpr const char* CLOUD_COVERS     = "/cloud_covers.json";
          // covers for the listings that are not playlists - Liked Songs and
          // All songs - asked for through the playlist cover calls under a
          // reserved name. kept out of playlists.json so they never come back
          // as a playlist of their own
          constexpr const char* VIEW_COVERS_FILE = "/view_covers.json";

          constexpr const int MIN_COUNT = 50;

          // what is shown when no cover is known: an asset uploaded to the
          // application on discord's developer portal, named by its key
          constexpr const char* DISCORD_LOGO_ASSET = "yugen";

          // the key as the environment had it at startup, which is only how it
          // arrives the first time - init() puts it on disk and api_key() is
          // what everything reads afterwards. getenv answers with nothing at all
          // when the variable was never set, and a std::string cannot be built
          // from that, so it is checked before it is used.
          const char* env = getenv("LASTFM_API_KEY");
          std::string API_KEY = env ? env : "";

          // the volume as it was last set, so the poll behind the slider does not
          // read vol off the disk several times a second
          std::optional<float> cached_vol;

          // full path -> the tags read off that file. a scan asks about every
          // track in the folder and taglib opens the file to answer, so this is
          // what keeps a rescan from paying for the whole library twice. it is
          // not mirrored anywhere: the files themselves are the copy that lasts.
          std::unordered_map<std::string, std::vector<std::string>> cached_metadata;

          // the last track handed to publish_activity(), kept so that turning
          // sharing back on can put it up again right away
          std::mutex discord_mtx;
          TrackInfo discord_track;
          bool discord_running = false;
          // set from the ui through set_activity(), read whenever a status is
          // about to go up - atomic because those are two different threads
          std::atomic<bool> share_activity_on_dc = true;
          // follows the transport rather than the ui: playback being paused takes
          // the status down without touching what the user asked for, so resuming
          // puts it back up instead of coming back to a switch that turned itself off
          std::atomic<bool> share_activity_paused = false;

          /*
           * Every cache here is read and written from more than one thread -
           * each binding runs its call on its own - so each one is behind a lock
           * of its own rather than one lock over all of them: a scan reading
           * tags has nothing to wait for behind a lyric sheet being written.
           *
           * cached_vol is the exception and needs none. It is a scalar written
           * whole, and a torn read of it is not a thing that can happen.
           */

          // over cached_metadata, which is declared further up with the rest of
          // what is only ever held in memory
          std::mutex metadata_mtx;

          // file name -> cover url, mirrored to covers.json. a miss is stored as
          // an empty string, so a track without artwork is looked up once and
          // never asked about again
          std::mutex cover_mtx;
          json cover_cache;          
          bool cover_cache_loaded = false;

          // the same arrangement for lyrics, mirrored to lyrics.json: a track
          // lrclib has nothing for is stored as an empty sheet, which is an
          // answer and is why the miss is worth keeping. the file is read once
          // per run and rewritten whole whenever a sheet is added - the loaded
          // flag is what says which of those has already happened.
          std::mutex lyrics_mtx;
          json lyrics_cache;
          bool lyrics_cache_loaded = false;

          // and once more for what last.fm answers about a track, mirrored to
          // info.json. what is kept is the whole reply rather than the picture
          // read out of it: the reading happens on the ui side, and a card that
          // comes to want more than a cover already has it here.
          std::mutex info_mtx;
          json info_cache;
          bool info_cache_loaded = false;

          std::mutex u_cover_mtx;
          json u_cover_cache;
          bool u_cover_cache_loaded = false;

          // custom_titles.json, the same arrangement once more
          std::mutex title_mtx;
          json title_cache;
          bool title_cache_loaded = false;

          // cloud_covers.json, and the uploads under way, so a pause and a
          // resume while one is still going do not send the picture twice
          std::mutex cloud_mtx;
          json cloud_cache;
          bool cloud_cache_loaded = false;
          std::set<std::string> cloud_inflight;


          // lookups already in flight, so two publishes of the same track do not
          // both go out to the network
          std::set<std::string> cover_inflight;

          // one voice at a time: starting a track tears the previous one down
          ma_sound sound;
          bool sound_initialized = false;

          // what next/prev walk over, filled in by shuffle_songs
          std::vector<std::string> play_queue;
          int queue_index = -1;
     }

     // Where everything the player owns is kept. Read out of the passwd entry
     // rather than $HOME so it stays right when the process is started by
     // something that does not set the environment, like a .desktop launcher.
     std::string config_dir()
     {
          passwd* p = getpwuid(getuid());
          return p ? std::string(p->pw_dir) + "/.config/yugen" : "";
     }

     /*
      * Core - yt-dlp, curl, and the artwork carried in the files themselves.
      */
     std::string Core::shell_quote(const std::string& arg)
     {
          // single quotes disable every expansion the shell does, so the only
          // character left to handle is the quote itself
          std::string out = "'";

          for(char c : arg)
          {
               if(c == '\'') out += "'\\''";
               else out += c;
          }

          out += "'";

          return out;
     }

     // Runs a command and hands back its stdout split into lines. yt-dlp prints
     // one field per line with --print, so a line here is a field, not a result.
     std::vector<std::string> Core::run_command_lines(const std::string& cmd)
     {
          FILE* pipe = popen(cmd.c_str(), "r");
          if(!pipe) return {};

          std::vector<std::string> results;
          std::array<char, 512> buffer;

          while(fgets(buffer.data(), buffer.size(), pipe))
          {
               std::string line(buffer.data());
               if(!line.empty() && line.back() == '\n') line.pop_back();
               results.push_back(std::move(line));
          }

          pclose(pipe);

          return results;
     }

     // Two lines per hit, in --print order: title, id. --flat-playlist keeps
     // yt-dlp from opening each video, which is what makes the search fast.
     std::vector<std::string> Core::search_youtube(const std::string& query, int count)
     {
          // Ensure minimum results are fetched for frontend pagination.
          // yt-dlp returns only available results if fewer exist, no error handling needed.
          if(count < MIN_COUNT) count = MIN_COUNT;
          const std::string target = "ytsearch" + std::to_string(count) + ":" + query;

          return run_command_lines("yt-dlp " + shell_quote(target) +
               " --flat-playlist --no-warnings --skip-download --print title --print id");
     }

     // Four lines per hit: title, page url, thumbnail url, track id. Soundcloud
     // has no id to rebuild a url from the way youtube does, so the url is
     // carried along - and the id as well, since a download is named after it
     // (`<title> [<id>].mp3`), which is how the ui knows a hit is already in the
     // library without going by a title that two different tracks can share.
     std::vector<std::string> Core::search_sound_cloud(const std::string& query, int count)
     {
          if(count < MIN_COUNT) count = MIN_COUNT; 
          const std::string target = "scsearch" + std::to_string(count) + ":" + query;

          return run_command_lines("yt-dlp " + shell_quote(target) +
               " --flat-playlist --no-warnings --skip-download --print title --print webpage_url"
               " --print '%(thumbnails.0.url)s' --print id");
     }

     // Shared body of the two download calls: extract the audio, transcode to mp3
     // and let yt-dlp write the cover and the tags into the file, so the library
     // can read them back later without a second lookup. Blocks until it is done.
     std::string Core::download_with_ytdlp(const std::string& target, const std::string& output_path)
     {
          const std::string cmd = "yt-dlp -x --audio-format mp3 --embed-thumbnail --embed-metadata -o " +
               shell_quote(output_path + "/%(title)s [%(id)s].%(ext)s") + " " + shell_quote(target);

          const int status = std::system(cmd.c_str());

          if(status != 0)
          {
               std::println("[ERROR] yt-dlp exited with {} for {}", status, target);
               return "";
          }

          return "done";
     }

     std::string Core::download_from_yt(const std::string& id, const std::string& output_path)
     {
          return download_with_ytdlp("https://youtube.com/watch?v=" + id, output_path);
     }

     std::string Core::download_from_sc(const std::string& url, const std::string& output_path)
     {
          return download_with_ytdlp(url, output_path);
     }

     // curl hands the body over in chunks; each one is appended to the string it
     // was given through CURLOPT_WRITEDATA. Returning less than it was handed
     // tells curl to abort the transfer, so the full count always comes back.
     std::size_t Core::write_callback(void* contents, std::size_t size, std::size_t nmemb, std::string* output)
     {
          const std::size_t bytes = size * nmemb;
          output->append(reinterpret_cast<const char*>(contents), bytes);

          return bytes;
     }

     // Blocking GET, whole body in a string. Returns an empty string on any
     // failure - the callers have nothing useful to do with the reason.
     std::string Core::fetch_url(const std::string& url)
     {
          CURL* curl = curl_easy_init();
          if(!curl) return "";

          std::string response;
          curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
          curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_callback);
          curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
          curl_easy_setopt(curl, CURLOPT_USERAGENT, "yugen/1.0");
          curl_easy_perform(curl);
          curl_easy_cleanup(curl);

          return response;
     }

     /*
      * lyrics.json into memory, once. Every entry is read back at the first
      * question rather than a file being opened per track, and the flag is set
      * before the read rather than after it: a file that is not there, will not
      * open, or does not parse leaves an empty cache that works, and asking
      * again would only fail the same way.
      *
      * allow_exceptions is off - that is the third argument - because this runs
      * on a binding's own thread, where a throw is not an error that reaches
      * anyone but the one that takes the process down with it. A half-written
      * file comes back discarded instead, and is treated as no file at all.
      *
      * The caller holds lyrics_mtx. This touches all three globals and takes no
      * lock of its own.
      */
     static void load_lyrics_cache()
     {
          if(lyrics_cache_loaded) return;

          lyrics_cache_loaded = true;
          lyrics_cache = json::object();

          const std::string path = config_dir() + LYRICS_FILE;

          if(!fs::exists(path)) return;
          
          std::ifstream f(path);
          if(!f.is_open()) return;

          const auto data = json::parse(f, nullptr, false);
          if(!data.is_discarded() && data.is_object()) lyrics_cache = data;
     }

     /*
      * A sheet already known for this track, if any. The outer optional says
      * whether the track has been looked up at all, the string whether anything
      * was found - so a track lrclib has nothing for is an empty string here and
      * never goes out to the network a second time.
      */
     static std::optional<std::string> cached_lyrics(const std::string& key)
     {
          std::lock_guard<std::mutex> lock(lyrics_mtx);
          
          load_lyrics_cache();
          
          if(!lyrics_cache.contains(key)) return std::nullopt;

          return lyrics_cache.at(key).get<std::string>();
     }

     // What came back, written through to disk on the spot. The whole file goes
     // out again rather than the one entry: it is json, there is no appending to
     // it, and a sheet is only added when a track is played for the first time.
     static void store_lyrics(const std::string& key, const std::string& url)
     {
          std::lock_guard<std::mutex> lk(lyrics_mtx);

          load_lyrics_cache();

          lyrics_cache[key] = url;

          std::ofstream out(config_dir() + LYRICS_FILE);
          if(out.is_open()) out << lyrics_cache.dump(4);

     }

     static void load_info_cache()
     {
          if(info_cache_loaded) return;

          info_cache_loaded = true;
          info_cache = json::object();

          const std::string path = config_dir() + INFO_FILE;

          if(!fs::exists(path)) return;
          
          std::ifstream f(path);
          if(!f.is_open()) return;

          const auto data = json::parse(f, nullptr, false);
          if(!data.is_discarded() && data.is_object()) info_cache = data;
     }

     /*
      * The answer already held for this track, if any. The outer optional says
      * whether the track has been asked about at all, the string what came back
      * - so a track last.fm had nothing to say about is an empty string here
      * rather than a miss, and never goes out to the network a second time.
      */
     static std::optional<std::string> cached_info(const std::string& key)
     {
          std::lock_guard<std::mutex> lock(info_mtx);
          
          load_info_cache();
          
          if(!info_cache.contains(key)) return std::nullopt;

          return info_cache.at(key).get<std::string>();
     }

     // What came back, written through to disk on the spot. The whole file goes
     // out again rather than the one entry: it is json, there is no appending to
     // it, and an entry is only added the first time a card is drawn for a track.
     static void store_info(const std::string& key, const std::string& data)
     {
          std::lock_guard<std::mutex> lk(info_mtx);

          load_info_cache();

          info_cache[key] = data;

          std::ofstream out(config_dir() + INFO_FILE);
          if(out.is_open()) out << info_cache.dump(4);

     }

     /*
      * Asks lrclib for every sheet matching the track and picks one out of the
      * results. The title and artist go through curl's escaping first, since a
      * track name is free text and lands straight in a query string.
      *
      * Nothing here is asked twice. Whatever the search ends up with - a timed
      * sheet, a plain one, or nothing - is stored under the track before it is
      * returned, and the next play answers from lyrics.json without a request.
      * The one thing not stored is a failure: no curl handle and an empty
      * response are the network being unreachable rather than lrclib saying it
      * has nothing, and remembering those would make the miss permanent.
      */
     std::string Core::get_lyrics(const std::string& title, const std::string& artist)
     {
          // artist first, so the file reads as one artist's tracks together
          const std::string cached_key = artist + " - " + title;

          auto cached = yugen::cached_lyrics(cached_key);
          
          if(cached.has_value()) {
               DBG("Loaded lyrics from cache for {}", cached_key);
               return cached.value();
          }

          CURL* curl = curl_easy_init();
          if(!curl) return "";

          char* enc_title = curl_easy_escape(curl, title.c_str(), 0);
          char* enc_artist = curl_easy_escape(curl, artist.c_str(), 0);

          std::string url = "https://lrclib.net/api/search?track_name=";

          if(enc_title) url += enc_title;
          url += "&artist_name=";
          if(enc_artist) url += enc_artist;

          curl_free(enc_title);
          curl_free(enc_artist);
          curl_easy_cleanup(curl);

          const std::string response = fetch_url(url);
          if(response.empty()) return "";

          const auto data = json::parse(response, nullptr, false);
          if(data.is_discarded() || data.empty()) {
               store_lyrics(cached_key, "");
               return "";
          }
          
          // the search returns every match and only some of them carry timings, so
          // a timed sheet anywhere in the list beats the closest name match
          for(const auto& hit : data)
          {
               if(hit.contains("syncedLyrics") && !hit["syncedLyrics"].is_null())
               {
                    store_lyrics(cached_key, hit["syncedLyrics"].get<std::string>());
                    DBG("Added lyrics for {} to cache", cached_key);
                    return hit["syncedLyrics"].get<std::string>();
               }
          }

          // nothing is timed: fall back in the order the search ranked them
          for(const auto& hit : data)
          {
               if(hit.contains("plainLyrics") && !hit["plainLyrics"].is_null())
               {
                    store_lyrics(cached_key, hit["plainLyrics"].get<std::string>());
                    DBG("Added lyrics for {} to cache", cached_key);
                    return hit["plainLyrics"].get<std::string>();
               }
          }

          store_lyrics(cached_key, "");
          return "";
     }

     std::size_t Core::get_playlist_count()
     {
          return MusicManager::get_playlists().size() + 1; 
     }
     

     // Reads the embedded cover out of the mp3's ID3v2 APIC frame and returns it
     // base64 encoded, so the ui can drop it into an <img> src without a file on
     // disk to serve. Empty string when the file carries no artwork.
     // Discord cannot read the cover embedded in the file, only fetch a url, so
     // the artwork has to be found somewhere public. The itunes search endpoint
     // needs no key and answers with a 100x100 url, which resizes by rewriting
     // the size in the path.
     std::string Core::lookup_cover_url(const std::string& title, const std::string& artist)
     {
          if(title.empty()) return "";

          CURL* curl = curl_easy_init();
          if(!curl) return "";

          const std::string term = artist.empty() ? title : artist + " " + title;
          char* enc_term = curl_easy_escape(curl, term.c_str(), 0);

          std::string url = "https://itunes.apple.com/search?entity=song&limit=1&term=";
          if(enc_term) url += enc_term;

          curl_free(enc_term);
          curl_easy_cleanup(curl);

          const std::string response = fetch_url(url);
          if(response.empty()) return "";

          const auto data = json::parse(response, nullptr, false);
          if(data.is_discarded() || !data.contains("results") || data["results"].empty()) return "";

          const auto& hit = data["results"][0];
          if(!hit.contains("artworkUrl100") || !hit["artworkUrl100"].is_string()) return "";

          std::string artwork = hit["artworkUrl100"].get<std::string>();

          const auto size = artwork.find("100x100");
          if(size != std::string::npos) artwork.replace(size, 7, "512x512");

          return artwork;
     }

     static void load_u_cover_cache() 
     {
          if(u_cover_cache_loaded) return;

          u_cover_cache_loaded = true;
          u_cover_cache = json::object();

          const std::string path = config_dir() + CUSTOM_COVERS;

          if(!fs::exists(path)) return;

          std::ifstream f(path);
          if(!f.is_open()) return;

          const auto data = json::parse(f, nullptr, false);
          if(!data.is_discarded() && data.is_object()) u_cover_cache = data;
     }

     static std::optional<std::string> cached_u_cover(const std::string& key) 
     {
          std::lock_guard<std::mutex> lk(u_cover_mtx);

          load_u_cover_cache();

          if(!u_cover_cache.contains(key)) return std::nullopt;

          const auto& hit = u_cover_cache.at(key);

          if(hit.is_string() && !hit.empty()) {
               return hit.get<std::string>();
          }

          return std::nullopt;
     }

     static void store_u_cover(const std::string& key, const std::string& base64_img)
     {
          std::lock_guard<std::mutex> lk(u_cover_mtx);

          load_u_cover_cache();

          u_cover_cache[key] = base64_img;

          std::ofstream out(config_dir() + CUSTOM_COVERS);
          if(out.is_open()) {
               out << u_cover_cache.dump(4);
          }
     }
 
     /*
      * Custom titles: custom_titles.json into memory once, read and written
      * under title_mtx, the whole file rewritten on every change - the same
      * shape as the custom covers above. An empty title is no title: the entry
      * is taken out and the tags speak again.
      */
     static void load_title_cache()
     {
          if(title_cache_loaded) return;

          title_cache_loaded = true;
          title_cache = json::object();

          const std::string path = config_dir() + CUSTOM_TITLES;
          if(!fs::exists(path)) return;

          std::ifstream f(path);
          if(!f.is_open()) return;

          const auto data = json::parse(f, nullptr, false);
          if(!data.is_discarded() && data.is_object()) title_cache = data;
     }

     static std::optional<std::string> custom_title(const std::string& file_path)
     {
          std::lock_guard<std::mutex> lk(title_mtx);

          load_title_cache();

          const auto hit = title_cache.find(file_path);
          if(hit == title_cache.end() || !hit->is_string() || hit->get<std::string>().empty()) return std::nullopt;

          return hit->get<std::string>();
     }

     std::string Core::get_cover(const std::string& file_path)
     {
          // file_path is a key also, so we can use it.
          // check if key exists in cache, if so return it.
          const auto cached = cached_u_cover(file_path);

          if(cached.has_value()) {
               DBG("Loaded custom cover from cache, key: {}", file_path);
               return cached.value();
          }

          const std::string covers_path = config_dir() + CUSTOM_COVERS;
          json covers = json::object();
          if(fs::exists(covers_path)) {
               std::ifstream f(covers_path);
               if(f.is_open()) {
                    covers = json::parse(f, nullptr, false);
               }
          }

          if(!covers.is_discarded() && covers.is_object() && covers.contains(file_path)) 
          {
               const auto& hit = covers.at(file_path);
               if(hit.is_string() && !hit.empty()) {
                    //A new custom cover??? add it to cache.
                    DBG("Added new custom cover to cache: {}", file_path);
                    const std::string val = hit.get<std::string>();
                    store_u_cover(file_path, val);

                    return val;
               }
          }

          TagLib::MPEG::File f(file_path.c_str());

          auto* tag = f.ID3v2Tag();
          if(!tag) return "";

          auto frames = tag->frameListMap()["APIC"];
          if(frames.isEmpty()) return "";

          auto* pic = static_cast<TagLib::ID3v2::AttachedPictureFrame*>(frames.front());
          auto data = pic->picture();

          return base64_encode(reinterpret_cast<const unsigned char*>(data.data()), data.size());
     }

     // Plain base64: three bytes in, four characters out, the tail padded with =.
     std::string Core::base64_encode(const unsigned char* data, std::size_t len)
     {
          static const char* chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

          std::string result;
          result.reserve(((len + 2) / 3) * 4); // exact size, so no reallocation while encoding

          for(std::size_t i = 0; i < len; i += 3)
          {
               unsigned int b = (data[i] << 16) 
               | (i + 1 < len ? data[i + 1] << 8 : 0) | (i + 2 < len ? data[i + 2] : 0);
               result += chars[(b >> 18) & 0x3F];
               result += chars[(b >> 12) & 0x3F];

               result += (i + 1 < len) ? chars[(b >> 6) & 0x3F] : '=';
               result += (i + 2 < len) ? chars[b & 0x3F] : '=';
          }

          return result;
     }

     /*
      * SoundManager - the single voice, the queue, and the tags on disk.
      */
     // Starts a track: the previous sound is stopped and freed first, so only one
     // is ever alive. The tags are passed in from the ui rather than read off the
     // file again here, since it already has them from get_metadata.
     void SoundManager::play(ma_engine* engine, const std::string& file_path,
                    const std::string& title, const std::string& artist, const std::string& album)
     {
          if(sound_initialized)
          {
               share_activity_paused = false;
               ma_sound_stop(&sound);
               ma_sound_uninit(&sound);

               sound_initialized = false;
          }

          const float last_vol = load_volume();

          const ma_result res = ma_sound_init_from_file(engine, file_path.c_str(), 0, nullptr, nullptr, &sound);

          if(res != MA_SUCCESS)
          {
               // `sound` is left untouched by a failed init, so nothing to tear down
               std::println("[ERROR] Sound init failed ({}): {}", static_cast<int>(res), file_path);
               return;
          }

          ma_sound_set_volume(&sound, last_vol);
          ma_sound_start(&sound);
          sound_initialized = true;

          std::println("[INFO] Playing: {}", file_path.substr(file_path.find_last_of('/') + 1));

          TrackInfo track {.title = title, .artist = artist, .album = album, .file_path = file_path};

          // the caller normally passes the tags it already has, but not every
          // call site does, and the ui may not have read them yet - so an empty
          // title means going to the file for them rather than showing nothing
          if(track.title.empty())
          {
               const auto meta = get_metadata(file_path);
               if(meta.size() >= 3)
               {
                    track = {
                         .title = meta[0],
                         .artist = meta[1],
                         .album = meta[2],
                         .file_path = file_path
                    };
               }
          }

          // untagged file: the name on disk is still better than a blank status
          if(track.title.empty()) track.title = fs::path(file_path).filename().string();

          // handed over even when sharing is off: publish_activity() records it
          // either way, so switching sharing back on can put up whatever is
          // playing at that moment instead of waiting for the next track
          publish_activity(track);
     }

     // Puts the remembered track up again without changing what is being shared.
     // set_activity() does the same copy, but it writes the sharing flag on the
     // way through, so it cannot stand in for this - the transport has to be able
     // to take the status down and bring it back while the ui switch stays put.
     //
     // The copy is taken under the lock and published outside it, since
     // publish_activity() takes discord_mtx itself.
     void republish_activity() 
     {
          TrackInfo track;
          {
               std::lock_guard<std::mutex> lk(discord_mtx);
               track = discord_track;
          }

          publish_activity(track);
     }

     // Pausing and resuming both republish: discord only knows what it was last
     // told, so a status left standing keeps counting up its progress bar as if
     // the track were still running.
     void SoundManager::resume()
     {
          if(sound_initialized) {
               share_activity_paused = false;
               ma_sound_start(&sound);

               // the timestamps are rebuilt from the current position, so the bar
               // picks up where it stopped rather than where the track began
               republish_activity();
          }
     }

     // The flag is set whether or not sharing is on, so that switching it on
     // while paused does not put up a track that is not playing.
     void SoundManager::stop()
     {
          if(sound_initialized) {
               share_activity_paused = true;
               ma_sound_stop(&sound);

               republish_activity();
          }
     }

     // miniaudio counts in pcm frames, the ui thinks in seconds, so the position
     // is scaled by the engine's sample rate on the way in.
     void SoundManager::seek(float position)
     {
          if(!sound_initialized) return;

          const float sample_rate = ma_engine_get_sample_rate(sound.engineNode.pEngine);
          const ma_uint64 frame = static_cast<ma_uint64>(position * sample_rate);

          ma_sound_seek_to_pcm_frame(&sound, frame);
     }

     void SoundManager::toggle_loop()
     {
          if(!sound_initialized) return;

          const ma_bool32 cur = ma_sound_is_looping(&sound);
          ma_sound_set_looping(&sound, !cur);
     }

     std::string SoundManager::next_song()
     {
          if(play_queue.empty()) return "";

          const int size = static_cast<int>(play_queue.size());
          queue_index = (queue_index + 1) % size;

          return play_queue[queue_index];
     }

     std::string SoundManager::prev_song()
     {
          if(play_queue.empty()) return "";

          // C++ keeps the sign on a negative modulo, so wrapping past the first
          // track has to add the size back before taking the remainder
          const int size = static_cast<int>(play_queue.size());
          queue_index = ((queue_index - 1) % size + size) % size;

          return play_queue[queue_index];
     }

     // True once a track has been loaded, and it stays true while paused - what
     // it really answers is whether there is a current track at all.
     bool SoundManager::is_playing()
     {
          return sound_initialized;
     }

     // Polled by the ui to decide when to move on to the next track.
     bool SoundManager::is_finished()
     {
          if(!sound_initialized) return false;

          return ma_sound_at_end(&sound);
     }

     float SoundManager::get_pos()
     {
          float cursor = 0.0f;
          if(sound_initialized) ma_sound_get_cursor_in_seconds(&sound, &cursor);

          return cursor;
     }

     float SoundManager::get_len()
     {
          float len = 0.0f;
          if(sound_initialized) ma_sound_get_length_in_seconds(&sound, &len);

          return len;
     }

     // Every mp3 directly inside the folder, file names only - the ui already
     // knows the folder it asked about. Not recursive.
     std::vector<std::string> SoundManager::fetch_songs(const std::string& file_path)
     {
          if(!fs::exists(file_path)) return {};

          std::vector<std::string> out_vec;

          for(const auto& entry : fs::directory_iterator(file_path))
          {
               if(entry.path().extension() == ".mp3") out_vec.push_back(entry.path().filename().string());
          }

          return out_vec;
     }

     // the mp3 has no "added" tag, so the file's own mtime stands in for it
     static long added_time(const std::string& file_path)
     {
          std::error_code ec;
          auto stamp = fs::last_write_time(file_path, ec);

          if(ec) return 0;

          auto epoch = std::chrono::clock_cast<std::chrono::system_clock>(stamp);

          return std::chrono::duration_cast<std::chrono::seconds>(epoch.time_since_epoch()).count();
     }

     // Title, artist, album, length in seconds and the added timestamp, in that
     // order - the ui unpacks it positionally. Empty when the file has no tags.
     //
     // Answered from memory after the first time. A scan asks about every track
     // in the folder and taglib opens the file to answer each one, so a rescan
     // over a library that has not changed used to cost the whole read again.
     // A file with no tags is remembered too, as the empty answer it gave: it is
     // still an answer, and re-opening the file cannot turn it into another one.
     //
     // The cache is keyed by full path and nothing clears it, so tags edited
     // while the player is running are not picked up until it restarts.
     std::vector<std::string> SoundManager::get_metadata(const std::string& file_path)
     {
          // the tail of the path, for the tracing below: a full path per track
          // is most of a line and none of it is the part being said
          const std::string song_name = file_path.substr(file_path.find_last_of('/') + 1);

          // the lock is held over the lookup rather than the whole function: the
          // taglib read below is the slow part and nothing in the map is needed
          // while it runs
          {
               std::lock_guard<std::mutex> lk(metadata_mtx);
               if(cached_metadata.find(file_path) != cached_metadata.end()) 
               {
                    DBG("Get metadata for {} from cache", song_name);
                    return cached_metadata.at(file_path);
               }
          }

          TagLib::FileRef f(file_path.c_str());
          if(f.isNull() || !f.tag()) {
               std::lock_guard<std::mutex> lk(metadata_mtx);
               cached_metadata[file_path] = {};
               DBG("Failed to get metadata due to null file: {}", file_path);
               DBG("Null file added to cache: {}", file_path);
               return {};
          }

          TagLib::Tag* tag = f.tag();

          std::vector<std::string> out_vec;
          out_vec.reserve(5);

          out_vec.emplace_back(tag->title().toCString(true));
          out_vec.emplace_back(tag->artist().toCString(true));
          out_vec.emplace_back(tag->album().toCString(true));

          // seconds, read from the header so the file does not have to be played
          const int seconds = f.audioProperties() ? f.audioProperties()->lengthInSeconds() : 0;
          out_vec.emplace_back(std::to_string(seconds));

          // unix seconds, what "recently added" sorts on
          out_vec.emplace_back(std::to_string(added_time(file_path)));
          {
               std::lock_guard<std::mutex> lk(metadata_mtx);
               cached_metadata[file_path] = out_vec;
          }
          DBG("Added metadata for {} to cache", song_name);
          return out_vec;
     }

     void SoundManager::delete_song(const std::string& file_path)
     {
          if(!fs::exists(file_path)) return;

          fs::remove(file_path);
     }

     // The slider writes here and the poll behind it reads load_volume(), so the
     // two are kept in step through cached_vol: vol is written for the next
     // launch rather than to be read back during this one.
     void SoundManager::set_volume(float volume)
     {
          if(sound_initialized) {
               cached_vol = volume;
               DBG("Updated cached volume to {}", volume);
               ma_sound_set_volume(&sound, volume);
          }

          std::ofstream out(config_dir() + "/vol");
          out << volume;
     }

     // What the player should come up at, and what the slider reads back while it
     // is running. The file is only ever touched on the first ask of a run -
     // after that set_volume() has already put the answer in cached_vol, and a
     // slider being dragged would otherwise open vol on every frame.
     float SoundManager::load_volume()
     {
          if(cached_vol.has_value()) {
               DBG("Loaded volume from cache: {}", cached_vol.value());
               return cached_vol.value();
          }

          std::string path = config_dir() + "/vol";
          if(fs::exists(path))
          {
               std::ifstream f(path);
               float vol;
               f >> vol;
               if(f.fail()) {
                    return 1.0f;
               }
               cached_vol = vol;
               DBG("Loaded volume from disk: {}", vol);
               return vol;
          }

          return 1.0f;
     }

     /*
      * MusicManager - playlists.json and liked_songs.json.
      * The whole playlists file, or an empty object if it is missing or unreadable,
      * so a first run behaves like an empty library instead of an error
      */
     json MusicManager::load_playlists()
     {
          const std::string path = config_dir() + PLAYLISTS_FILE;

          if(!fs::exists(path)) return json::object();

          std::ifstream f(path);
          if(!f.is_open()) return json::object();

          return json::parse(f);
     }

     // Writes the object back out indented, so the file stays hand-editable.
     bool MusicManager::save_playlists(const json& data)
     {
          const std::string path = config_dir() + PLAYLISTS_FILE;

          std::ofstream out(path);
          if(!out.is_open()) return false;

          try
          {
               out << data.dump(4);
               return true;
          }
          catch(const fs::filesystem_error&)
          {
               return false;
          }
     }

     std::vector<std::string> MusicManager::get_playlists()
     {
          const json data = load_playlists();

          std::vector<std::string> names;
          names.reserve(data.size());

          for(const auto& [name, tracks] : data.items()) names.push_back(name);

          return names;
     }

     std::vector<std::string> MusicManager::get_playlist(const std::string& playlist_name)
     {
          const json data = load_playlists();

          if(!data.contains(playlist_name) || data[playlist_name].empty()) return {};

          auto& playlist = data.at(playlist_name);
          
          if(!playlist.contains("songs")) return {};

          return playlist.at("songs").get<std::vector<std::string>>();
     }

     bool MusicManager::create_playlist(const std::string& playlist_name)
     {
          json data = load_playlists();

          if(!data.contains(playlist_name))
          {
               data[playlist_name] = json::object();
          }

          return save_playlists(data);
     }

     bool MusicManager::delete_playlist(const std::string& playlist_name)
     {
          json data = load_playlists();

          if(data.contains(playlist_name))
          {
               data.erase(playlist_name);
          }

          return save_playlists(data);
     }

     bool MusicManager::rename_playlist(const std::string& playlist_name, const std::string& new_playlist_name)
     {
          json data = load_playlists();

          if(data.contains(playlist_name) && !data.contains(new_playlist_name))
          {
               data[new_playlist_name] = data[playlist_name];
               data.erase(playlist_name);
          }

          return save_playlists(data);
     }

     bool MusicManager::add_to_playlist(const std::string& playlist_name, const std::string& file_path)
     {
          if(playlist_name.empty() || file_path.empty()) return false;

          json data = load_playlists();

          if(!data.contains(playlist_name)) return false;

          auto& playlist = data[playlist_name];

          if(std::find(playlist["songs"].begin(), playlist["songs"].end(), file_path) != playlist["songs"].end()) return false;

          playlist["songs"].push_back(file_path);

          return save_playlists(data);
     }

     bool MusicManager::remove_from_playlist(const std::string& playlist_name, const std::string& file_path)
     {
          if(playlist_name.empty() || file_path.empty()) return false;
          json data = load_playlists();

          if(!data.contains(playlist_name)) return false;

          auto& playlist = data.at(playlist_name);
          auto it = std::find(playlist["songs"].begin(), playlist["songs"].end(), file_path);

          if(it == playlist["songs"].end()) return false;

          playlist["songs"].erase(it);

          return save_playlists(data);
     }

     std::vector<std::string> MusicManager::get_liked_songs()
     {
          const std::string path = config_dir() + LIKED_SONGS_FILE;
          if(!fs::exists(path)) return {};

          std::ifstream f(path);
          const json data = json::parse(f);

          std::vector<std::string> liked_songs;
          liked_songs.reserve(data.size());

          for(const auto& song : data) liked_songs.push_back(song);

          return liked_songs;
     }

     void MusicManager::like_song(const std::string& name)
     {
          const std::string path = config_dir() + LIKED_SONGS_FILE;

          json data = json::array();

          if(fs::exists(path))
          {
               std::ifstream f(path);
               data = json::parse(f);
          }

          data.push_back(name);

          std::ofstream out(path);
          out << data.dump(4);
     }

     void MusicManager::unlike_song(const std::string& name)
     {
          const std::string path = config_dir() + LIKED_SONGS_FILE;

          json data = json::array();

          if(fs::exists(path))
          {
               std::ifstream f(path);
               data = json::parse(f);
          }

          data.erase(std::remove(data.begin(), data.end(), name), data.end());

          std::ofstream out(path);
          out << data.dump(4);
     }

     // Shuffles the given songs and arms them as the queue next/prev walk over,
     // then returns the new order so the ui can show it in the same sequence.
     std::vector<std::string> MusicManager::shuffle_songs(const std::vector<std::string>& songs)
     {
          play_queue = songs;

          std::random_device rd;
          std::mt19937 g(rd());
          std::shuffle(play_queue.begin(), play_queue.end(), g);

          queue_index = 0;

          return play_queue;
     }

     /*
      * Discord rich presence.
      */
     // Opens the rpc connection. The library starts a worker thread that keeps
     // trying until the discord client answers and reconnects on its own if it
     // is closed and reopened later, so this returns immediately and never fails
     // in a way yugen has to handle - with no discord running, nothing happens.
     void start_discord(std::uint64_t app_id)
     {
          auto& rpc = discord::RPCManager::get();

          rpc.setClientID(std::to_string(app_id))
             .onReady([](const discord::User& user)
             {
                  std::println("[Discord] Connected as {}", user.username);
             })
             .onDisconnected([](int code, std::string_view message)
             {
                  std::println("[Discord] Disconnected ({}): {}", code, message);
             })
             .onErrored([](int code, std::string_view message)
             {
                  std::println("[Discord] Error ({}): {}", code, message);
             });

          rpc.initialize();

          {
               std::lock_guard<std::mutex> lk(discord_mtx);
               discord_running = true;
          }
     }

     // Clears the status before closing, otherwise the last track would sit on
     // the profile until the discord client itself notices yugen is gone.
     void stop_discord()
     {
          {
               std::lock_guard<std::mutex> lk(discord_mtx);
               discord_running = false;
          }

          discord::RPCManager::get().shutdown();
     }

     // The cover cache lives next to the playlists and is read once per run.
     // Callers must hold cover_mtx.
     static void load_cover_cache()
     {
          if(cover_cache_loaded) return;

          cover_cache_loaded = true;
          cover_cache = json::object();

          const std::string path = config_dir() + COVERS_FILE;
          if(!fs::exists(path)) return;

          std::ifstream f(path);
          if(!f.is_open()) return;

          const auto data = json::parse(f, nullptr, false);
          if(!data.is_discarded() && data.is_object()) cover_cache = data;
     }

     // A url already known for this track, if any. The outer optional says whether
     // the track has been looked up at all, the string whether anything was found.
     static std::optional<std::string> cached_cover(const std::string& key)
     {
          std::lock_guard<std::mutex> lk(cover_mtx);

          load_cover_cache();

          if(!cover_cache.contains(key)) return std::nullopt;

          return cover_cache.at(key).get<std::string>();
     }

     static void store_cover(const std::string& key, const std::string& url)
     {
          std::lock_guard<std::mutex> lk(cover_mtx);

          load_cover_cache();

          cover_cache[key] = url;
          cover_inflight.erase(key);

          std::ofstream out(config_dir() + COVERS_FILE);
          if(out.is_open()) out << cover_cache.dump(4);
     }

     // Tracks downloaded from youtube carry their video id in the file name, put
     // there by the -o template, and youtube serves a thumbnail under that id. So
     // for those the cover costs nothing: no request, no cache entry.
     static std::string youtube_cover(const std::string& file_name)
     {
          const auto close = file_name.rfind(']');
          if(close == std::string::npos) return "";

          const auto open = file_name.rfind('[', close);
          if(open == std::string::npos) return "";

          const std::string id = file_name.substr(open + 1, close - open - 1);

          // youtube ids are eleven characters of url-safe base64; a soundcloud id
          // is a plain number, which is what keeps the two apart here
          if(id.size() != 11) return "";

          for(char c : id)
          {
               if(!std::isalnum(static_cast<unsigned char>(c)) && c != '-' && c != '_') return "";
          }

          return "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg";
     }

     // Asks itunes on a worker thread and republishes the status once the answer
     // is in, so the track goes up immediately and the artwork catches up. A track
     // that has moved on in the meantime is left alone.
     static void request_cover_async(const TrackInfo& track, const std::string& key)
     {
          {
               std::lock_guard<std::mutex> lk(cover_mtx);
               if(!cover_inflight.insert(key).second) return;
          }

          std::thread worker{[track, key]()
          {
               const std::string url = Core::lookup_cover_url(track.title, track.artist);
               store_cover(key, url);

               if(url.empty()) return;

               publish_activity(track);
          }};

          worker.detach();
     }

     /*
      * Covers on discord that only exist on this machine.
      *
      * Discord draws an activity's picture by fetching a url, so a cover the
      * listener gave a track, or one that is only in the file's own tags, has
      * to be put somewhere public first. That is a cloudinary account the
      * listener owns (cloudinary.json). An upload is signed - the secret never
      * leaves this process - and named after the picture's own sha1, so the
      * same picture is only ever put up once and a changed one goes up anew.
      * The url handed to discord asks cloudinary for a 512 square of it.
      *
      * Uploads run on a thread of their own, like the itunes lookup: the status
      * goes up at once with whatever is known, and is put up again with the
      * picture once it is there - if the track is still the one playing.
      */
     struct CloudAccount
     {
          std::string name;
          std::string api_key;
          std::string secret;
     };

     // read on every upload rather than once: it is a few bytes, and an
     // account added or fixed while the player is running is then picked up
     static std::optional<CloudAccount> cloud_account()
     {
          std::ifstream f(config_dir() + CLOUDINARY_FILE);
          if(!f.is_open()) return std::nullopt;

          const auto data = json::parse(f, nullptr, false);
          if(data.is_discarded() || !data.is_object()) return std::nullopt;

          const auto text = [&](const char* key) {
               const auto it = data.find(key);
               return it != data.end() && it->is_string() ? it->get<std::string>() : std::string{};
          };

          CloudAccount account {.name = text("name"), .api_key = text("api_key"), .secret = text("secret_key")};
          if(account.name.empty() || account.api_key.empty() || account.secret.empty()) return std::nullopt;

          return account;
     }

     // sha-1, as cloudinary signs with it, in lowercase hex. a few dozen lines
     // here rather than a crypto library linked in for one hash
     static std::string sha1_hex(const std::string& input)
     {
          std::uint32_t h[5] = {0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0};

          std::string msg = input;
          const std::uint64_t bits = static_cast<std::uint64_t>(input.size()) * 8;
          msg += static_cast<char>(0x80);
          while(msg.size() % 64 != 56) msg += '\0';
          for(int i = 7; i >= 0; i--) msg += static_cast<char>((bits >> (i * 8)) & 0xFF);

          const auto rotl = [](std::uint32_t x, int n) { return (x << n) | (x >> (32 - n)); };

          for(std::size_t chunk = 0; chunk < msg.size(); chunk += 64)
          {
               std::uint32_t w[80];
               for(int i = 0; i < 16; i++)
               {
                    const auto* b = reinterpret_cast<const unsigned char*>(msg.data() + chunk + i * 4);
                    w[i] = (std::uint32_t(b[0]) << 24) | (std::uint32_t(b[1]) << 16) | (std::uint32_t(b[2]) << 8) | std::uint32_t(b[3]);
               }
               for(int i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);

               std::uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4];
               for(int i = 0; i < 80; i++)
               {
                    std::uint32_t f, k;
                    if(i < 20) { f = (b & c) | (~b & d); k = 0x5A827999; }
                    else if(i < 40) { f = b ^ c ^ d; k = 0x6ED9EBA1; }
                    else if(i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8F1BBCDC; }
                    else { f = b ^ c ^ d; k = 0xCA62C1D6; }

                    const std::uint32_t t = rotl(a, 5) + f + e + k + w[i];
                    e = d; d = c; c = rotl(b, 30); b = a; a = t;
               }

               h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e;
          }

          std::string out;
          for(const auto word : h) out += std::format("{:08x}", word);
          return out;
     }

     // Callers must hold cloud_mtx.
     static void load_cloud_cache()
     {
          if(cloud_cache_loaded) return;

          cloud_cache_loaded = true;
          cloud_cache = json::object();

          const std::string path = config_dir() + CLOUD_COVERS;
          if(!fs::exists(path)) return;

          std::ifstream f(path);
          if(!f.is_open()) return;

          const auto data = json::parse(f, nullptr, false);
          if(!data.is_discarded() && data.is_object()) cloud_cache = data;
     }

     static std::optional<std::string> cached_cloud(const std::string& key)
     {
          std::lock_guard<std::mutex> lk(cloud_mtx);

          load_cloud_cache();

          const auto hit = cloud_cache.find(key);
          if(hit == cloud_cache.end() || !hit->is_string()) return std::nullopt;

          return hit->get<std::string>();
     }

     static void store_cloud(const std::string& key, const std::string& url)
     {
          std::lock_guard<std::mutex> lk(cloud_mtx);

          load_cloud_cache();

          cloud_cache[key] = url;

          std::ofstream out(config_dir() + CLOUD_COVERS);
          if(out.is_open()) out << cloud_cache.dump(4);
     }

     // One signed upload; the url discord is to fetch, or "" when it failed.
     static std::string upload_cover(const CloudAccount& account, const std::string& base64_img)
     {
          // the format, off the first bytes of the data; jpeg unless it says otherwise
          const char* mime = base64_img.starts_with("iVBOR") ? "image/png"
               : base64_img.starts_with("R0lG") ? "image/gif"
               : base64_img.starts_with("UklG") ? "image/webp"
               : "image/jpeg";

          const std::string public_id = "yugen/" + sha1_hex(base64_img);
          const std::string timestamp = std::to_string(std::chrono::duration_cast<std::chrono::seconds>(
               std::chrono::system_clock::now().time_since_epoch()).count());

          // every parameter but the file and the key, sorted, then the secret
          const std::string signature = sha1_hex("overwrite=true&public_id=" + public_id + "&timestamp=" + timestamp + account.secret);

          CURL* curl = curl_easy_init();
          if(!curl) return "";

          curl_mime* form = curl_mime_init(curl);
          const auto field = [&](const char* name, const std::string& value) {
               curl_mimepart* part = curl_mime_addpart(form);
               curl_mime_name(part, name);
               curl_mime_data(part, value.data(), value.size());
          };

          field("file", std::string("data:") + mime + ";base64," + base64_img);
          field("api_key", account.api_key);
          field("timestamp", timestamp);
          field("public_id", public_id);
          field("overwrite", "true");
          field("signature", signature);

          const std::string endpoint = "https://api.cloudinary.com/v1_1/" + account.name + "/image/upload";
          std::string response;

          curl_easy_setopt(curl, CURLOPT_URL, endpoint.c_str());
          curl_easy_setopt(curl, CURLOPT_MIMEPOST, form);
          curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, +[](void* data, std::size_t size, std::size_t count, std::string* out) {
               out->append(static_cast<const char*>(data), size * count);
               return size * count;
          });
          curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
          curl_easy_setopt(curl, CURLOPT_USERAGENT, "yugen/1.0");
          curl_easy_setopt(curl, CURLOPT_TIMEOUT, 60L);

          const CURLcode res = curl_easy_perform(curl);
          curl_mime_free(form);
          curl_easy_cleanup(curl);

          if(res != CURLE_OK)
          {
               std::println("[Discord] Cover upload failed: {}", curl_easy_strerror(res));
               return "";
          }

          const auto data = json::parse(response, nullptr, false);
          if(data.is_discarded() || !data.contains("secure_url") || !data["secure_url"].is_string())
          {
               const std::string reason = !data.is_discarded() && data.contains("error") && data["error"].contains("message")
                    ? data["error"]["message"].get<std::string>() : response.substr(0, 200);
               std::println("[Discord] Cover upload refused: {}", reason);
               return "";
          }

          // a 512 square, cut to fill, at whatever quality cloudinary thinks enough
          std::string url = data["secure_url"].get<std::string>();
          const auto at = url.find("/upload/");
          if(at != std::string::npos) url.insert(at + 8, "c_fill,w_512,h_512,q_auto/");

          std::println("[Discord] Cover uploaded: {}", url);
          return url;
     }

     // Puts the status up again if `file_path` is still what it shows. Taken
     // under the lock and published outside it, as republish_activity() does.
     static void republish_if_playing(const std::string& file_path)
     {
          bool same = false;
          {
               std::lock_guard<std::mutex> lk(discord_mtx);
               same = !discord_track.file_path.empty() && discord_track.file_path == file_path;
          }

          if(same) republish_activity();
     }

     /*
      * The url of a picture put up on cloudinary under `key`, if it is there;
      * otherwise "" and, with an account to put it on, an upload on its way.
      * `read` hands over the picture as base64 and is only called on the
      * upload's own thread, so reading a file's tags never holds up a status.
      */
     static std::string cloud_cover(const std::string& key, const std::string& file_path, std::function<std::string()> read)
     {
          if(const auto known = cached_cloud(key)) return *known;

          const auto account = cloud_account();
          if(!account) return "";

          {
               std::lock_guard<std::mutex> lk(cloud_mtx);
               if(!cloud_inflight.insert(key).second) return "";
          }

          std::thread worker{[account = *account, key, file_path, read = std::move(read)]()
          {
               const std::string picture = read();
               // nothing to put up is an answer, and kept; a failed upload is
               // not, and is tried again the next time the track goes up
               const std::string url = picture.empty() ? "" : upload_cover(account, picture);
               if(picture.empty() || !url.empty()) store_cloud(key, url);

               {
                    std::lock_guard<std::mutex> lk(cloud_mtx);
                    cloud_inflight.erase(key);
               }

               if(!url.empty()) republish_if_playing(file_path);
          }};

          worker.detach();
          return "";
     }

     // Builds the status and queues it; the library's worker thread does the
     // writing, so this returns without touching the socket.
     //
     // The track is remembered whatever the sharing flag says, because that is
     // what set_activity() puts up when it is switched back on. An empty title
     // means there is nothing to show - the status comes down instead.
     void publish_activity(const TrackInfo& track)
     {
          std::lock_guard<std::mutex> lk(discord_mtx);

          discord_track = track;

          if(!discord_running) return;

          auto& rpc = discord::RPCManager::get();

          if(share_activity_paused || !share_activity_on_dc || track.title.empty())
          {
               rpc.clearPresence();
               return;
          }

          // where the track sits right now, turned into the wall clock window it
          // occupies, which is what discord draws the progress bar from
          const auto now = std::chrono::duration_cast<std::chrono::seconds>(
               std::chrono::system_clock::now().time_since_epoch()).count();

          const std::int64_t started = now - static_cast<std::int64_t>(SoundManager::get_pos());
          const std::int64_t ends = started + static_cast<std::int64_t>(SoundManager::get_len());

          // a title of the listener's own wins over the tags
          const std::string title = custom_title(track.file_path).value_or(track.title);

          // the cover, if one is known by now; the logo stands in until then and
          // whenever the track turns out to have no artwork anywhere. a cover
          // the listener gave the track comes first, put up on cloudinary; then
          // youtube's thumbnail and the itunes lookup; and when those found
          // nothing, the picture in the file's own tags, put up the same way
          const std::string key = fs::path(track.file_path).filename().string();
          std::string image;

          if(const auto own = cached_u_cover(track.file_path))
          {
               const std::string picture = *own;
               image = cloud_cover("custom:" + sha1_hex(picture), track.file_path, [picture] { return picture; });
          }

          if(image.empty()) image = youtube_cover(key);

          if(image.empty())
          {
               const auto known = cached_cover(key);

               if(known) image = *known;
               else if(!key.empty()) request_cover_async(track, key);

               if(known && known->empty())
               {
                    const std::string path = track.file_path;
                    image = cloud_cover("file:" + key, path, [path] { return Core::get_cover(path); });
               }
          }

          if(image.empty()) image = DISCORD_LOGO_ASSET;

          rpc.getPresence()
             .setActivityType(discord::ActivityType::Listening)
             // the status line reads "Listening to <details>" rather than
             // "Listening to yugen", which is the closest a third party app
             // gets to how the spotify integration looks
             .setStatusDisplayType(discord::StatusDisplayType::Details)
             .setDetails(title)
             .setState(track.artist)
             .setLargeImageKey(image)
             .setLargeImageText(track.album.empty() ? "Yugen" : track.album)
             .setStartTimestamp(started)
             .setEndTimestamp(ends);

          rpc.refresh();
     }

     // Takes effect immediately: the flag is flipped and the remembered track is
     // republished, so turning it off takes the status down and turning it on
     // puts what is playing up without waiting for the next track.
     void set_activity(bool act)
     {
          share_activity_on_dc = act;

          TrackInfo track;
          {
               std::lock_guard<std::mutex> lk(discord_mtx);
               track = discord_track;
          }

          publish_activity(track);
     }

     // Read by the ui on startup, so the switch comes up matching the real state.
     bool get_activity()
     {
          return share_activity_on_dc;
     }

     std::vector<TrackInfo> Profile::get_favorite_songs()
     {
          const json data = load_profile();

          if(data.empty() || !data.contains("favorite_songs") || 
               data["favorite_songs"].empty()) return {};

          std::vector<TrackInfo> songs {};
          for(const auto& s : data["favorite_songs"])
          {
               TrackInfo t;
               t.title = s.value("title", "");
               t.artist = s.value("artist", "");
               t.album = s.value("album","");
               t.file_path = s.value("file_path","");
               songs.push_back(t);
          }

          return songs;
     }

     bool Profile::add_favorite_song(const TrackInfo& track)
     {
          json data = load_profile();
          auto& arr = data["favorite_songs"];
          bool found = false;
          for(const auto& item : arr)
          {
               if(item.value("file_path", "") == track.file_path) {
                    found = true;
                    break;
               }
          }

          if(!found)
          {
               json song;
               song["title"] = track.title;
               song["artist"] = track.artist;
               song["album"] = track.album;
               song["file_path"] = track.file_path;

               data["favorite_songs"].push_back(song);
          }

          return save_data(data);
     }

     std::string Profile::get_profile_picture()
     {
          const json data = load_profile();
          if(data.empty()) return "";

          return data.contains("profile_pic_path") ? data["profile_pic_path"] : "";
     }

     std::string Profile::get_username()
     {
          const json data = load_profile();
          if(data.empty()) return "";

          return data.contains("username") ? data["username"] : "";
     }

     std::string Profile::get_biography()
     {
          const json data = load_profile();
          if(data.empty()) return "";

          return data.contains("biography") ? data["biography"] : "";
     }

     bool Profile::save_data(const json& data)
     {
          const std::string path = config_dir() + PROFILE_FILE;

          std::ofstream out(path);

          if(!out.is_open()) return false;

          try 
          {
               out << data.dump(4);
               return true;
          } 
          catch (std::exception& e) 
          {
               return false;
          }
     }

     json Profile::load_profile()
     {
          const std::string path = config_dir() + PROFILE_FILE;
          if(!fs::exists(path)) return json::object();

          std::ifstream f(path);
          if(!f.is_open()) return json::object();

          try {
               return json::parse(f);
          } catch (json::exception& e) {
               return json::object();
          }
     }

     bool Profile::set_profile_picture(const std::string& base64_data)
     {
          json data = load_profile();
          data["profile_pic_path"] = base64_data;
          return save_data(data);
     }

     bool Profile::set_username(const std::string& username)
     {
          json data = load_profile();
          data["username"] = username;
          return save_data(data);
     }

     bool Profile::set_biography(const std::string& bio)
     {
          json data = load_profile();
          data["biography"] = bio;
          return save_data(data);
     }

     bool Profile::remove_from_favorites(const std::string& file_path)
     {
          json data = load_profile();
          if(data.empty() || !data.contains("favorite_songs")) return false;

          auto& arr = data["favorite_songs"];
          for(auto it = arr.begin(); it != arr.end(); ++it)
          {
               if((*it).value("file_path","") == file_path) {
                    arr.erase(it);
                    break;
               }
          }
          return save_data(data);
     }

     /*
      * The tracks last.fm puts next to one of ours, as json text - the ui reads
      * it, since the json library in here is not the one saucer serialises with.
      *
      * It answers about one track at a time because that is the shape of the
      * call behind it: the file is read for its tags first, so what goes out is
      * a title and an artist rather than a path. Both are free text landing in a
      * query string, so both go through curl's escaping. Anything missing - no
      * key, no file, nothing back, nothing parseable - is an empty answer rather
      * than an error, and the ui carries on around it.
      */
     std::string MusicManager::get_similar(const std::string& file_path, const int limit = 10)
     {
          if(file_path.empty()) return {};
          if(!fs::exists(file_path)) return {};
          
          std::string url = "https://ws.audioscrobbler.com/2.0/?method=track.getsimilar";

          if(api_key().empty()) {
               std::println("[WARNING] NO LASTFM API KEY FOUND.");
               return "";
          }

          std::vector<std::string> metadata = SoundManager::get_metadata(file_path);
          const std::string title = metadata.size() > 0 ? metadata[0] : "";
          const std::string artist = metadata.size() > 1 ? metadata[1] : "";

          CURL* curl = curl_easy_init();
          if(!curl) return {};

          if(!artist.empty()) 
          {
               char* enc = curl_easy_escape(curl, artist.c_str(), 0);
               url += "&artist=" + std::string(enc);
               curl_free(enc);
          }

          if(!title.empty())
          {
               char* enc = curl_easy_escape(curl, title.c_str(), 0);
               url += "&track=" + std::string(enc);
               curl_free(enc); 
          }

          url += "&api_key=" + api_key()
          + "&format=json&autocorrect=1" + "&limit=" + std::to_string(limit);

          curl_easy_cleanup(curl);

          const std::string response = Core::fetch_url(url);
          if(response.empty()) return {};


          // parsed without throwing: what comes back is whatever the far end
          // felt like sending, including an error object with no tracks in it
          const auto data = json::parse(response, nullptr, false);
          if(data.is_discarded() || data.empty()) return {};
          if(!data.contains("similartracks")) return {};
          
          json result = json::array();

          const auto& similar = data["similartracks"];
          if(!similar.contains("track") || !similar["track"].is_array()) return {};

          const auto& tracks = similar["track"];

          // each entry is rebuilt rather than passed along as it arrived: the ui
          // wants four fields and last.fm sends a page of them
          for(const auto& t : tracks)
          {
               std::string name = t.value("name","");
               std::string art;

               if(t.contains("artist")) art = t["artist"].value("name","");

               // the sizes come as a list, and the largest is the one worth
               // showing on a card
               std::string img;
               if(t.contains("image") && t["image"].is_array()) {
                    for(const auto& i : t["image"]) {
                         if(i.value("size", "") == "extralarge") {
                              img = i.value("#text", "");
                              break;
                         }
                    }
               }

               // the placeholder is not a picture, and the ui would rather go
               // and look for a real one than hang a grey star on the shelf
               if(img.find(PLACEHOLDER) != std::string::npos) {
                    img = "";
               }

               // a track with no name is nothing the ui could show or search for
               if(!name.empty()) 
               {
                    // closeness to the track we asked about, which is the
                    // order the suggestions are read in. last.fm sends it as a
                    // number in some answers and as text in others, so both are
                    // taken - and one it cannot answer for sorts last rather
                    // than costing the whole pass.
                    double score = 0.0;

                    if(t.contains("match")) 
                    {
                         const auto& m = t["match"];
                         if(m.is_number()) {
                              score = m.get<double>();
                         } else if(m.is_string()) {
                              score = std::strtod(m.get<std::string>().c_str(), nullptr);
                         }
                    }

                    result.push_back({
                         {"name", name},
                         {"artist", art},
                         {"image", img},
                         {"match", score}
                    });
               }
          }

          return result.dump();
     }

     /*
      * Everything last.fm holds on one track, handed over as the json text it
      * answered with.
      *
      * get_similar hands back most of its suggestions with nothing to show -
      * the similar list carries the placeholder far more often than it carries
      * artwork - so this is the second look, and the ui spends it per card.
      * What a track page keeps is the album's cover rather than the track's,
      * and it is not picked out here: the reply is passed on whole and read on
      * the ui side, where the placeholder is filtered and a card that ends up
      * with nothing is simply not shown.
      *
      * Answers are kept, so a shelf drawn a second time costs no requests. One
      * that came back with nothing is kept as well - that is an answer too, and
      * the point of holding it is not to ask again.
      */
     std::string MusicManager::get_info(const std::string& artist, const std::string& track_name)
     {
          const std::string cached_key = artist + " - " + track_name;
          auto cached = yugen::cached_info(cached_key);
          if(cached.has_value()) {
               DBG("Fetched info for {} from cache", cached_key);
               return cached.value();
          }

          if(api_key().empty()) {
               std::println("[WARNING] NO LASTFM API KEY FOUND.");
               return "";
          }

          std::string url = "https://ws.audioscrobbler.com/2.0/?method=track.getInfo";
          
          CURL* curl = curl_easy_init();
          if(!curl) return "";

          if(!artist.empty()) {
               char* enc = curl_easy_escape(curl, artist.c_str(), 0);
               url += "&artist=" + std::string(enc);
               curl_free(enc);
          }

          if(!track_name.empty()) {
               char* enc = curl_easy_escape(curl, track_name.c_str(), 0);
               url += "&track=" + std::string(enc);
               curl_free(enc);
          }

          url += "&api_key=" + api_key() + "&format=json";

          curl_easy_cleanup(curl);
          
          const std::string response = Core::fetch_url(url);

          if(response.empty()) return "";

          const auto data = json::parse(response, nullptr, false);
          if(data.is_discarded() || data.empty()) {
               store_info(cached_key, "");
               DBG("Failed to get data for {}, added to cache: {}", cached_key, cached_key);
               return {};
          }

          store_info(cached_key, data.dump());
          DBG("Fetched and added to cache successfully: {}", cached_key);
          
          if(data.contains("track") && data["track"].contains("wiki")) {
               const std::string summary = data["track"]["wiki"].at("summary");
               const std::string content = data["track"]["wiki"].at("content");
               DBG("Wiki for {}: \nSummary: {} \nContent: {}", cached_key, summary, content);
          }
          
          return data.dump();
     }

     /*
      * Keeps the key across runs.
      *
      * An `export` only lives in the shell that ran it: the app started from a
      * launcher next time - or from any other terminal - would come up without
      * one. So the first run that does have it writes it down, and every run
      * after that reads the file instead. Called once at startup, after the
      * data directory exists: an ofstream cannot make the directory itself, and
      * this failing quietly would look exactly like a key that never worked.
      *
      * A key already on disk is left alone. Nothing here is worth stopping the
      * app over, so a filesystem that will not cooperate is reported and
      * stepped over - it costs suggestions, not the player.
      */
     void MusicManager::init()
     {
          const std::string path = config_dir() + API_KEY_FILE;
          try {
               if(!fs::exists(path)) {
                    if(!API_KEY.empty()) {
                         std::ofstream f(path);
                         if(!f.is_open()) return;
                         f << API_KEY;
                    }
               }
          } catch (const fs::filesystem_error& e) {
               std::println("[WARN] Filesystem error: {}", e.what());
          }
     }

     /*
      * The key, wherever it is. The environment wins, since it is the one that
      * can be changed without touching anything, and the file init() left is
      * the fallback.
      *
      * Read once and kept: these two calls go out on a thread each and the ui
      * fires four of them at a time, so a value everyone parses for themselves
      * is a race rather than a saving. A function-local static is initialised by
      * whichever thread arrives first while the rest wait, and it is const
      * afterwards - nobody writes to it again.
      * 
      * >> stops at the first space, which is what trims the newline off a file
      * written by a shell.
      */
     const std::string& MusicManager::api_key()
     {
          static const std::string key = [] {
               const char* env = getenv("LASTFM_API_KEY");
               if(env && *env) return std::string(env);

               std::ifstream f(config_dir() + API_KEY_FILE);
               std::string k;
               if(f) f >> k;
               return k;
          }();

          return key;
     }

     // The names the ui uses for the two built-in listings. A playlist someone
     // renamed to exactly one of these would have its cover read from here too;
     // the underscores are there to keep that from happening by accident.
     static bool is_view_cover(const std::string& name)
     {
          return name == "__liked__" || name == "__songs__";
     }

     static json load_view_covers()
     {
          std::ifstream f(config_dir() + VIEW_COVERS_FILE);
          if(!f.is_open()) return json::object();

          json data = json::parse(f, nullptr, false);
          return !data.is_discarded() && data.is_object() ? data : json::object();
     }

     bool MusicManager::set_or_update_playlist_cover(const std::string& playlist_name, const std::string& base64_pic) 
     {
          if(playlist_name.empty() || base64_pic.empty()) return false;

          if(is_view_cover(playlist_name))
          {
               json covers = load_view_covers();
               covers[playlist_name] = base64_pic;

               std::ofstream out(config_dir() + VIEW_COVERS_FILE);
               if(!out.is_open()) return false;
               out << covers.dump(4);

               return out.good();
          }

          json data = load_playlists();
          if(!data.contains(playlist_name)) return false;

          auto& playlist = data[playlist_name];
          playlist["cover"] = base64_pic;
          return save_playlists(data);
     }

     std::string MusicManager::get_playlist_cover(const std::string &playlist_name) 
     {
          if(playlist_name.empty()) return "";

          if(is_view_cover(playlist_name))
          {
               const json covers = load_view_covers();
               const auto it = covers.find(playlist_name);

               return it != covers.end() && it->is_string() ? it->get<std::string>() : "";
          }

          json data = load_playlists();
          if(!data.contains(playlist_name)) return "";

          auto& playlist = data[playlist_name];

          if(playlist.empty() || playlist["cover"].empty()) return "";

          return playlist["cover"];
     }

     json Settings::load_data()
     {
          const std::string path = config_dir() + SETTINGS_FILE;
          std::ifstream f(path);
          if(!f.is_open()) return json::object();
          json data = json::parse(f, nullptr, false);
          if(!data.is_discarded() && data.is_object()) return data;
          return json::object();
     }

     bool Settings::save_data(const json& data)
     {
          const std::string path = config_dir() + SETTINGS_FILE;
          std::ofstream out(path);
          if(!out.is_open()) return false;
          out << data;
          out.close();
          if(out.fail()) return false;
          return true;
     }

     bool Settings::set(const std::string &key, const std::string &value)
     {
          if(key.empty() || value.empty()) {
               DBG("IN FUNCTION Settings::set, Key or Value is empty. Key: {} - Value: {}", key, value);
               if(value.empty()) {
                    return false;
               }
          }

          json data = load_data();
          if(data.empty()) {
               DBG("IN FUNCTION Settings::set, Empty data  detected. Data: {} ", data.dump());
          }

          data[key] = value;
          return save_data(data);

     }

     bool Settings::remove(const std::string &key)
     {
          if(key.empty()) {
               DBG("IN FUNCTION Settings::remove, Key is empty. Key: {} ", key);
          }

          json data = load_data();
          if(data.empty()) {
               DBG("IN FUNCTION Settings::remove, Empty data  detected. Data: {} ", data.dump());
               return false;
          }

          if(data.erase(key) == 0) return false;
          return save_data(data);
     }

     std::string Settings::get(const std::string &key)
     {
          if(key.empty()) {
               DBG("IN FUNCTION Settings::get, Key is empty. Key: {} ", key);
               return "";
          }

          const json data = load_data();
          if(data.empty()) return "";
          if(!data.contains(key)) return "";

          return data.at(key).get<std::string>();
     }

     std::string Settings::get_all()
     {
          const json data = load_data();
          if(data.empty()) return "";

          return data.dump();
     }

     bool MusicManager::update_track_cover(const std::string& file_path, const std::string& base64_img)
     {
          DBG("Running function: update_track_cover(custom) --- file path: {}", file_path);
          if(!file_path.empty() && !base64_img.empty())
          {
               store_u_cover(file_path, base64_img);
               // the track on discord now has a picture of its own to show
               republish_if_playing(file_path);
               return true;
          }

          return false;
     }

     bool MusicManager::set_track_title(const std::string& file_path, const std::string& title)
     {
          if(file_path.empty()) return false;

          {
               std::lock_guard<std::mutex> lk(title_mtx);

               load_title_cache();

               if(title.empty()) title_cache.erase(file_path);
               else title_cache[file_path] = title;

               std::ofstream out(config_dir() + CUSTOM_TITLES);
               if(!out.is_open()) return false;
               out << title_cache.dump(4);
          }

          republish_if_playing(file_path);
          return true;
     }

     // json text, full path -> title, parsed on the ui side
     std::string MusicManager::get_track_titles()
     {
          std::lock_guard<std::mutex> lk(title_mtx);

          load_title_cache();

          return title_cache.dump();
     }
}
