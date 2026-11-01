"""Generate our own MP3 test signals; no music is downloaded or bundled."""
import math,struct,subprocess,tempfile,wave
from pathlib import Path

root=Path(__file__).resolve().parents[1]/'tests'/'fixtures';root.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as td:
    for hz,bpm in [(440,120),(660,125)]:
        sr=44100;pcm=bytearray();seed=17
        for i in range(sr*42):
            t=i/sr;phase=(t-.14)%(60/bpm)
            seed=(1664525*seed+1013904223)&0xffffffff
            x=.28*math.sin(2*math.pi*hz*t)+.065*math.sin(2*math.pi*1800*t)+.025*(seed/2147483648-1)
            x+=.36*math.sin(2*math.pi*80*phase)*math.exp(-35*phase)
            pcm+=struct.pack('<h',int(max(-.98,min(.98,x))*32767))
        path=Path(td)/'fixture.wav'
        with wave.open(str(path),'wb') as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr);w.writeframes(pcm)
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(path),'-c:a','libmp3lame','-b:a','32k','-map_metadata','-1',str(root/f'dj-{hz}.mp3')],check=True)
        print(root/f'dj-{hz}.mp3')
