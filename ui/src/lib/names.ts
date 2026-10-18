/*
 * What a file is called, and what it is called when someone else is asked
 * about it. yt-dlp names a download after the video, so neither the tags nor
 * the file name can be read as given.
 */
// the album and artist rows are keyed off these, and a blank tag falls into one
// shared bucket rather than a nameless one of its own
export const artist_tag = (meta?: string[]) => meta?.[1] || 'Unknown artist'
export const album_tag = (meta?: string[]) => meta?.[2] || 'Unknown album'
export const group_key = (tag: string) => tag.trim() || 'Unknown'

// the eleven characters youtube names a video by, which yt-dlp leaves on the end
// of the file name - and the file name is what a title falls back to when the
// download arrived carrying no tags at all
export const VIDEO_ID = /\s*\[[\w-]{11}\]\s*$/

// the words a video carries that a song does not. a bracket only comes off when
// one of them is inside it, which leaves '(feat. ...)' and every other bracket
// that is genuinely part of the title where it is.
export const VIDEO_NOISE =
    /\s*[([][^()[\]]*\b(?:official|lyrics?|audio|video|visuali[sz]er|remaster(?:ed)?|hd|hq|4k|m\/?v)\b[^()[\]]*[)\]]/gi

// what a channel is called rather than what the band is: yt-dlp fills the artist
// tag from the uploader, and an uploader is the name with 'Official' after it,
// the auto-generated '- Topic' feed, or a vevo account
export const CHANNEL = /\s*(?:-\s*topic|official|vevo)\s*$/i

// 'Artist - Song', the way a video is titled
export const TITLE_SPLIT = /^(.+?)\s+[-\u2013\u2014]\s+(.+)$/

// a video title quotes the name of the song inside it, and the quotes belong to
// the video. only a title wrapped in them end to end is unwrapped, so 'Don't'
// and 'Rock 'n' Roll' keep every mark they were written with.
export const QUOTED = /^["'\u2018\u201c](.+)["'\u2019\u201d]$/

// where the tag lists everyone who played, last.fm is holding the first name only
export const asked_artist = (tag: string) => tag.split(',')[0].replace(CHANNEL, '').trim()

/*
 * The two names to ask about, out of the two on the file.
 *
 * Neither tag can be taken as given, because neither was written by anyone who
 * had a music library in mind: yt-dlp puts the video's title in one and the
 * channel's name in the other, so a download arrives as 'Girlfriends' playing
 * 'Girlfriends - Untitled #3', or as 'Don Giovanni' - the label - playing
 * 'LSD and the Search for God - "Starting Over"'. Neither last.fm nor lrclib
 * knows a song by either of those names.
 *
 * So the video's dressing comes off, and then the dash in the title decides:
 *
 *   - nothing in front of it that reads as an artist, and the tag stands.
 *   - the tag repeated in front of it, and the repeat is what comes off.
 *   - something else in front of it, and that is taken over the tag. What sits
 *     in front of a dash in a video's title is the artist far more often than a
 *     channel name is, and a title that keeps its dash is one last.fm has never
 *     heard of anyway - so there is nothing being given up by guessing here.
 */
export function asked(title: string, artist: string) {
    const track = title.replace(VIDEO_ID, '').replace(VIDEO_NOISE, '').trim()
    // the stand-in a missing tag falls into is not a name to go looking for
    const named = artist === 'Unknown artist' ? '' : asked_artist(artist)

    const bare = (name: string) => name.trim().replace(QUOTED, '$1').trim()

    const split = TITLE_SPLIT.exec(track)
    if (!split) return { artist: named, track: bare(track) || title }

    const [, front, rest] = split
    const repeated = front.trim().toLowerCase() === named.toLowerCase()

    return { artist: repeated ? named : front.trim(), track: bare(rest) }
}

// download_with_ytdlp writes `<title> [<id>].mp3`, so a file in the library
// carries both halves a search result can be recognised by
export function library_mark(name: string) {
    const base = name.replace(/\.[^.]*$/, '')
    const open = base.lastIndexOf(' [')

    return open > 0 && base.endsWith(']')
        ? { title: base.slice(0, open), id: base.slice(open + 2, -1) }
        : { title: base, id: '' }
}

// one collator for every alphabetical sort: localeCompare builds the same
// thing again on each of the thousands of comparisons a sort makes
export const collate = new Intl.Collator().compare

// punctuation is where the two sides disagree - yt-dlp swaps out whatever the
// filesystem will not take - so a title comparison keeps letters and digits only
export const fold = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
