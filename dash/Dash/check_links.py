
import requests

PLAYLIST = [
    "https://archive.org/download/Gymnopedie_201309/Gymnop%C3%A9die%20No.%201.mp3",
    "https://archive.org/download/DebussyClairDeLune_584/01_Clair_de_Lune.mp3",
    "https://archive.org/download/MoonlightSonata_754/Beethoven-MoonlightSonata.mp3",
    "https://archive.org/download/ChopinNocturneOp.9No.2_337/Chopin-NocturneOp.9No.2.mp3"
]

for url in PLAYLIST:
    try:
        r = requests.head(url, allow_redirects=True, timeout=5)
        print(f"{url} -> {r.status_code}")
    except Exception as e:
        print(f"{url} -> ERROR: {e}")
