from contextlib import asynccontextmanager
from enum import Enum, auto

from fastapi import Body, FastAPI
from pathlib import Path

from pydantic import BaseModel
from dotenv import load_dotenv

import yt_dlp
import asyncio
import os


load_dotenv()

MIN_COUNT = 50 
PATH = os.getenv("MUSIC_PATH")

if not PATH:
    raise RuntimeError("No MUSIC_PATH set. Please set it first.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    global PATH
    raw = os.getenv("MUSIC_PATH")
    if not raw:
        raise RuntimeError("No MUSIC_PATH set. Please set it first")

    PATH = Path(raw).resolve()
    PATH.mkdir(parents=True, exist_ok=True)
    yield

app = FastAPI(lifespan=lifespan)

class SearchRequest(BaseModel):
    query: str
    count: int

class DownloadRequest(BaseModel):
    id: str
    url: str | None = None

class SCDownloadRequest(BaseModel):
    url: str

class Source(Enum):
    YOUTUBE = auto()
    SOUNDCLOUD = auto()

async def search_youtube(query: str = Body(..., embed=True), count: int = Body(..., embed=True)):
    if count < MIN_COUNT:
        count = MIN_COUNT

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True
    }
    
    loop = asyncio.get_event_loop()

    def search():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl: #type: ignore
            result = ydl.extract_info(f"ytsearch{count}:{query}", download=False)
            return result.get("entries", [])

    return await loop.run_in_executor(None, search)

async def search_soundcloud(query: str = Body(..., embed=True), count: int = Body(..., embed=True)):
    if count < MIN_COUNT:
        count = MIN_COUNT

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True
    }
    
    loop = asyncio.get_event_loop()

    def search():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl: #type: ignore
            result = ydl.extract_info(f"scsearch{count}:{query}", download=False)
            return result.get("entries", [])

    return await loop.run_in_executor(None, search)


async def m_download(id: str, o_path: str, source: Source, url: str | None = None):
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "format": "bestaudio/best",
        "outtmpl": f"{o_path}/%(id)s.%(ext)s",
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3"
        }]
    }

    loop = asyncio.get_event_loop()

    def download():
        with yt_dlp.YoutubeDL(ydl_opts) as ydl: #type: ignore
            if source == Source.YOUTUBE:
                ydl.download([f"https://youtube.com/watch?v={id}"])
            elif source == Source.SOUNDCLOUD and url:
                ydl.download([url])
            return f"{o_path}/{id}.mp3"

    return await loop.run_in_executor(None, download)


@app.post("/api/v1/search_yt")
async def e_search_yt(payload: SearchRequest):
    return await search_youtube(query=payload.query, count=payload.count)

@app.post("/api/v1/search_sc")
async def e_search_sc(payload: SearchRequest):
    return await search_soundcloud(query=payload.query, count=payload.count)

@app.post("/api/v1/download_yt")
async def d_yt(payload: DownloadRequest):
    if not PATH:
        raise RuntimeError("No PATH set. Please set it first.")
    return await m_download(id=payload.id, o_path=PATH, source=Source.YOUTUBE) #type: ignore

@app.post("/api/v1/download_sc")
async def d_sc(payload: DownloadRequest):
    if not PATH:
        raise RuntimeError("No PATH set. Please set it first.")
    return await m_download(id=payload.id, o_path=PATH, source=Source.SOUNDCLOUD, url=payload.url) #type: ignore 
