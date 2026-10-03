"""Seal a signing backup for its owner's RSA key, or recover it locally.
Only the public recovery key belongs in Git. No network or logging of secrets.
Requires: cryptography. AES-256-GCM + RSA-OAEP/SHA-256.
"""
import argparse
import base64
import json
import os
from pathlib import Path
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

APP = b'ru.deka2.player|signing-backup-v1'

def b64(data):
    return base64.b64encode(data).decode('ascii')

def seal(public_file: Path, output: Path):
    public = serialization.load_pem_public_key(public_file.read_bytes())
    store = Path(os.environ['ANDROID_KEYSTORE_PATH'])
    payload = json.dumps({
        'applicationId': 'ru.deka2.player',
        'keyAlias': os.environ['ANDROID_KEY_ALIAS'],
        'password': os.environ['ANDROID_KEYSTORE_PASSWORD'],
        'keystore': b64(store.read_bytes()),
    }, separators=(',', ':')).encode()
    key, nonce = AESGCM.generate_key(bit_length=256), os.urandom(12)
    ciphertext = AESGCM(key).encrypt(nonce, payload, APP)
    wrapped = public.encrypt(key, padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=APP))
    output.write_text(json.dumps({'format': 1, 'applicationId': 'ru.deka2.player',
                                 'wrappedKey': b64(wrapped), 'nonce': b64(nonce),
                                 'ciphertext': b64(ciphertext)}, indent=2) + '\n')

def recover(private_file: Path, envelope_file: Path, directory: Path):
    if directory.exists() and any(directory.iterdir()):
        raise ValueError('Recovery directory must be empty')
    envelope = json.loads(envelope_file.read_text())
    if envelope.get('format') != 1 or envelope.get('applicationId') != 'ru.deka2.player':
        raise ValueError('Not a Deka 2 signing backup')
    private = serialization.load_pem_private_key(private_file.read_bytes(), password=None)
    decode = lambda field: base64.b64decode(envelope[field], validate=True)
    key = private.decrypt(decode('wrappedKey'), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=APP))
    payload = json.loads(AESGCM(key).decrypt(decode('nonce'), decode('ciphertext'), APP))
    if payload.get('applicationId') != 'ru.deka2.player':
        raise ValueError('Signing identity mismatch')
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    files = {'deka2-signing.p12': base64.b64decode(payload['keystore'], validate=True),
             'signing-password.txt': (payload['password'] + '\n').encode(),
             'key-alias.txt': (payload['keyAlias'] + '\n').encode()}
    for name, data in files.items():
        dest = directory / name
        with dest.open('xb') as f:
            f.write(data)
        dest.chmod(0o600)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    p = sub.add_parser('seal'); p.add_argument('public', type=Path); p.add_argument('output', type=Path)
    p = sub.add_parser('recover'); p.add_argument('private', type=Path); p.add_argument('backup', type=Path); p.add_argument('directory', type=Path)
    args = parser.parse_args()
    if args.command == 'seal':
        seal(args.public, args.output)
        print('Encrypted signing backup created; private signing material not published.')
    else:
        recover(args.private, args.backup, args.directory)
        print('Recovered into the chosen private directory. Never commit these files.')

if __name__ == '__main__':
    main()
