/* eslint-disable react-refresh/only-export-components -- every export is a component, built by one factory the rule cannot see through */
import {
    ArrowLeft as PhArrowLeft,
    ArrowsClockwise as PhArrowsClockwise,
    ArrowsOutSimple as PhArrowsOutSimple,
    Article as PhArticle,
    Camera as PhCamera,
    CaretDoubleDown as PhCaretDoubleDown,
    CaretDoubleLeft as PhCaretDoubleLeft,
    CaretDown as PhCaretDown,
    CaretLeft as PhCaretLeft,
    CaretRight as PhCaretRight,
    CaretUp as PhCaretUp,
    Check as PhCheck,
    CircleNotch as PhCircleNotch,
    DiscordLogo as PhDiscordLogo,
    DownloadSimple as PhDownloadSimple,
    FolderOpen as PhFolderOpen,
    GearSix as PhGearSix,
    Heart as PhHeart,
    House as PhHouse,
    ImageSquare as PhImageSquare,
    Info as PhInfo,
    Keyboard as PhKeyboard,
    ListPlus as PhListPlus,
    MagnifyingGlass as PhMagnifyingGlass,
    MicrophoneStage as PhMicrophoneStage,
    Minus as PhMinus,
    Monitor as PhMonitor,
    MoonStars as PhMoonStars,
    MusicNote as PhMusicNote,
    MusicNotesSimple as PhMusicNotesSimple,
    Palette as PhPalette,
    Pause as PhPause,
    PencilSimple as PhPencilSimple,
    Play as PhPlay,
    Playlist as PhPlaylist,
    Plus as PhPlus,
    PushPin as PhPushPin,
    PushPinSlash as PhPushPinSlash,
    Quotes as PhQuotes,
    Repeat as PhRepeat,
    RepeatOnce as PhRepeatOnce,
    RowsPlusBottom as PhRowsPlusBottom,
    RowsPlusTop as PhRowsPlusTop,
    ShareNetwork as PhShareNetwork,
    Shuffle as PhShuffle,
    SidebarSimple as PhSidebarSimple,
    SkipBack as PhSkipBack,
    SkipForward as PhSkipForward,
    SortAscending as PhSortAscending,
    Sparkle as PhSparkle,
    SpeakerSimpleHigh as PhSpeakerSimpleHigh,
    SpeakerSimpleLow as PhSpeakerSimpleLow,
    SpeakerSimpleNone as PhSpeakerSimpleNone,
    SpeakerSimpleSlash as PhSpeakerSimpleSlash,
    SquaresFour as PhSquaresFour,
    Star as PhStar,
    Sun as PhSun,
    Trash as PhTrash,
    User as PhUser,
    UserSound as PhUserSound,
    VinylRecord as PhVinylRecord,
    Waveform as PhWaveform,
    X as PhX,
    DotsThree as PhDotsThree,
} from '@phosphor-icons/react'
import type { Icon as PhIcon, IconWeight } from '@phosphor-icons/react'

/*
 * Every icon in the app comes through here, so the set reads as one hand.
 *
 * Phosphor rather than a hairline set: the things you press to make music
 * happen - play, skip, the heart - are solid, the places you go are duotone
 * when you are there, and everything else is a quiet regular stroke. A
 * `fill-current` class still means "solid", which is how a heart that is on
 * says so wherever it is drawn.
 */
type Props = { size?: number; className?: string; weight?: IconWeight }

const make = (Glyph: PhIcon, fallback: IconWeight = 'regular') =>
    function Icon({ size = 16, className, weight }: Props) {
        const solid = className?.includes('fill-current')

        return <Glyph size={size} weight={weight ?? (solid ? 'fill' : fallback)} className={className} aria-hidden />
    }

// what is pressed to make music happen
export const Play = make(PhPlay, 'fill')
export const Pause = make(PhPause, 'fill')
export const SkipBack = make(PhSkipBack, 'fill')
export const SkipForward = make(PhSkipForward, 'fill')
export const Shuffle = make(PhShuffle, 'bold')
export const Repeat = make(PhRepeat, 'bold')
export const Repeat1 = make(PhRepeatOnce, 'bold')
export const Heart = make(PhHeart)
export const Star = make(PhStar)

// places
export const Home = make(PhHouse)
export const Music2 = make(PhMusicNotesSimple)
export const Disc3 = make(PhVinylRecord)
export const Mic2 = make(PhUserSound)
export const ListMusic = make(PhPlaylist)
export const MicVocal = make(PhMicrophoneStage)
export const Waveform = make(PhWaveform)

// everything else
export const ArrowLeft = make(PhArrowLeft)
export const Camera = make(PhCamera)
export const Check = make(PhCheck, 'bold')
export const ChevronDown = make(PhCaretDown, 'bold')
export const ChevronLeft = make(PhCaretLeft, 'bold')
export const ChevronRight = make(PhCaretRight, 'bold')
export const ChevronUp = make(PhCaretUp, 'bold')
export const CaretDoubleDown = make(PhCaretDoubleDown, 'bold')
export const CaretDoubleLeft = make(PhCaretDoubleLeft, 'bold')
export const Download = make(PhDownloadSimple, 'bold')
export const FileText = make(PhArticle)
export const FolderOpen = make(PhFolderOpen, 'duotone')
export const ImagePlus = make(PhImageSquare)
export const Info = make(PhInfo)
export const Keyboard = make(PhKeyboard, 'duotone')
export const LayoutGrid = make(PhSquaresFour)
export const ListStart = make(PhRowsPlusTop)
export const ListEnd = make(PhRowsPlusBottom)
export const ListFilter = make(PhSortAscending)
export const ListPlus = make(PhListPlus)
export const LoaderCircle = make(PhCircleNotch, 'bold')
export const Minus = make(PhMinus)
export const Monitor = make(PhMonitor)
export const Moon = make(PhMoonStars)
export const Music = make(PhMusicNote)
export const Palette = make(PhPalette, 'duotone')
export const PanelLeftClose = make(PhSidebarSimple)
export const PanelLeftOpen = make(PhSidebarSimple)
export const Pencil = make(PhPencilSimple)
export const Pin = make(PhPushPin)
export const PinOff = make(PhPushPinSlash)
export const Plus = make(PhPlus, 'bold')
export const RefreshCw = make(PhArrowsClockwise)
export const Search = make(PhMagnifyingGlass, 'bold')
export const Settings = make(PhGearSix)
export const Share2 = make(PhShareNetwork, 'duotone')
export const Sparkles = make(PhSparkle, 'duotone')
export const Sun = make(PhSun)
export const Trash2 = make(PhTrash)
export const User = make(PhUser)
export const Volume = make(PhSpeakerSimpleNone)
export const Volume1 = make(PhSpeakerSimpleLow)
export const Volume2 = make(PhSpeakerSimpleHigh)
export const VolumeX = make(PhSpeakerSimpleSlash)
export const X = make(PhX, 'bold')
export const Expand = make(PhArrowsOutSimple, 'bold')
export const Quotes = make(PhQuotes, 'fill')
export const Discord = make(PhDiscordLogo)
export const DotsThree = make(PhDotsThree, 'bold')

// the right panel's own toggle is the sidebar mark turned around
export function PanelRightClose(props: Props) {
    return <PhSidebarSimple size={props.size ?? 16} weight={props.weight ?? 'regular'} className={`-scale-x-100 ${props.className ?? ''}`} aria-hidden />
}

export const PanelRightOpen = PanelRightClose
