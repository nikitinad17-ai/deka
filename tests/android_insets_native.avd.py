"""Configure the emulator before launch; the action runs each script line separately."""
import os
import re
from pathlib import Path

config = Path(os.environ['ANDROID_AVD_HOME']) / 'test.avd/config.ini'
text = config.read_text()
for key, value in {'hw.lcd.width': '720', 'hw.lcd.height': '1600', 'hw.lcd.density': '320', 'skin.name': '720x1600'}.items():
    text = re.sub(r'^' + re.escape(key) + r'\s*=.*\n?', '', text, flags=re.M) + key + '=' + value + '\n'
config.write_text(text)
print('Native Android test display: 720x1600, density 320')
