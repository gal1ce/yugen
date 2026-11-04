import { requireNativeModule } from 'expo'

type YtDlp = {
    // the non-empty lines yt-dlp printed for these arguments
    lines(args: string[]): Promise<string[]>
    // a url, downloaded to an mp3 in Music/yugen; the file names it was given
    download(url: string): Promise<string[]>
    // fetches the latest stable yt-dlp; the update status
    update(): Promise<string>
    version(): string
}

export default requireNativeModule<YtDlp>('YtDlp')
