package dev.gal1ce.ytdlp

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLException
import com.yausername.youtubedl_android.YoutubeDLRequest
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/*
 * yt-dlp on the phone, the way services.cpp shells out to it on the desktop.
 * youtubedl-android carries a python, yt-dlp and ffmpeg and unpacks them into
 * the app's files the first time they are wanted.
 *
 * A download is made in the app's own cache and only the finished mp3 is
 * handed to the media store, under Music/yugen: the shared music folder takes
 * audio and nothing else, and yt-dlp's part files and thumbnails are not that.
 */
class YtDlpModule : Module() {
  @Volatile private var ready = false

  private val context: Context
    get() = appContext.reactContext?.applicationContext ?: throw CodedException("NO_CONTEXT", "the app has no context yet", null)

  @Synchronized
  private fun ensure() {
    if (ready) return
    YoutubeDL.getInstance().init(context)
    FFmpeg.getInstance().init(context)
    ready = true
  }

  // every line yt-dlp printed, the way run_command_lines reads them
  private fun run(args: List<String>): List<String> {
    ensure()
    val request = YoutubeDLRequest(emptyList<String>()).addCommands(args)
    val response = try {
      YoutubeDL.getInstance().execute(request)
    } catch (e: YoutubeDLException) {
      throw CodedException("YT_DLP", e.message ?: "yt-dlp failed", e)
    }
    return response.out.lines().filter { it.isNotEmpty() }
  }

  // the finished file, into the media store; the copy in the cache goes
  private fun publish(file: File): String {
    val resolver = context.contentResolver
    val values = ContentValues().apply {
      put(MediaStore.Audio.Media.DISPLAY_NAME, file.name)
      put(MediaStore.Audio.Media.MIME_TYPE, "audio/mpeg")
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        put(MediaStore.Audio.Media.RELATIVE_PATH, "${Environment.DIRECTORY_MUSIC}/yugen")
        put(MediaStore.Audio.Media.IS_PENDING, 1)
      }
    }

    val uri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values)
      ?: throw CodedException("MEDIA_STORE", "the media store would not take ${file.name}", null)

    resolver.openOutputStream(uri)?.use { out -> file.inputStream().use { it.copyTo(out) } }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      resolver.update(uri, ContentValues().apply { put(MediaStore.Audio.Media.IS_PENDING, 0) }, null, null)
    }

    file.delete()
    return file.name
  }

  override fun definition() = ModuleDefinition {
    Name("YtDlp")

    // the lines a search prints, one --print field to a line
    AsyncFunction("lines") Coroutine { args: List<String> ->
      withContext(Dispatchers.IO) { run(args) }
    }

    // one url to mp3s in Music/yugen; answers with the names they were given
    AsyncFunction("download") Coroutine { url: String ->
      withContext(Dispatchers.IO) {
        val work = File(context.cacheDir, "yt-dlp-${System.nanoTime()}").apply { mkdirs() }
        try {
          run(
            listOf(
              "-x", "--audio-format", "mp3",
              "--embed-thumbnail", "--embed-metadata",
              "--no-warnings",
              "-o", "${work.absolutePath}/%(title)s [%(id)s].%(ext)s",
              url,
            )
          )
          work.listFiles { f -> f.extension.equals("mp3", ignoreCase = true) }.orEmpty().map { publish(it) }
        } finally {
          work.deleteRecursively()
        }
      }
    }

    // yt-dlp ages faster than an app does: youtube changes, the bundled copy
    // stops working. this fetches the latest stable one
    AsyncFunction("update") Coroutine { ->
      withContext(Dispatchers.IO) {
        ensure()
        YoutubeDL.getInstance().updateYoutubeDL(context, YoutubeDL.UpdateChannel.STABLE)?.name ?: ""
      }
    }

    Function("version") {
      YoutubeDL.getInstance().versionName(context) ?: ""
    }
  }
}
