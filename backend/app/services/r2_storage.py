import base64
import mimetypes
import re
from datetime import datetime
from io import BytesIO
from urllib.parse import quote
from uuid import uuid4

from flask import current_app
from werkzeug.utils import secure_filename


DATA_URL_RE = re.compile(r'^data:(?P<mimetype>[-\w.+/]+);base64,(?P<data>.+)$', re.DOTALL)


def r2_configurado():
    return bool(current_app.config.get('R2_ENABLED'))


def eh_url_publica(valor):
    return str(valor or '').startswith(('http://', 'https://'))


def eh_data_url(valor):
    return bool(DATA_URL_RE.match(str(valor or '')))


def criar_nome_objeto(prefixo, nome_original=None, identificador=None, extensao=None):
    partes = [secure_filename(str(parte)) for parte in (prefixo, identificador) if parte]
    nome_base = secure_filename(nome_original or 'arquivo')

    if extensao and not nome_base.lower().endswith(extensao.lower()):
        raiz, _, _ = nome_base.rpartition('.')
        nome_base = f"{raiz or nome_base}.{extensao.lstrip('.')}"

    if not nome_base:
        nome_base = f"arquivo{extensao or ''}"

    if len(nome_base) > 120:
        raiz, ponto, ext = nome_base.rpartition('.')
        nome_base = f"{raiz[:100]}{ponto}{ext}" if ponto else nome_base[:120]

    partes.append(datetime.utcnow().strftime('%Y%m%d%H%M%S'))
    partes.append(uuid4().hex[:12])
    partes.append(nome_base)

    return '/'.join(partes)


def _cliente_s3():
    import boto3
    from botocore.client import Config as BotoConfig

    return boto3.client(
        's3',
        endpoint_url=current_app.config['R2_ENDPOINT_URL'],
        aws_access_key_id=current_app.config['R2_ACCESS_KEY_ID'],
        aws_secret_access_key=current_app.config['R2_SECRET_ACCESS_KEY'],
        config=BotoConfig(signature_version='s3v4')
    )


def _url_publica(nome_objeto):
    base_url = current_app.config['R2_PUBLIC_URL'].rstrip('/')
    return f"{base_url}/{quote(nome_objeto, safe='/')}"


def salvar_arquivo(arquivo, nome_objeto, content_type=None):
    if not r2_configurado():
        return None

    extra_args = {}
    if content_type:
        extra_args['ContentType'] = content_type

    stream = getattr(arquivo, 'stream', arquivo)
    try:
        stream.seek(0)
    except (AttributeError, OSError):
        pass

    _cliente_s3().upload_fileobj(
        stream,
        current_app.config['R2_BUCKET_NAME'],
        nome_objeto,
        ExtraArgs=extra_args or None
    )
    return _url_publica(nome_objeto)


def salvar_data_url(data_url, nome_original=None, prefixo='evidencias', identificador=None):
    if not r2_configurado() or not eh_data_url(data_url):
        return data_url

    match = DATA_URL_RE.match(str(data_url))
    mimetype = match.group('mimetype')
    conteudo = base64.b64decode(match.group('data'), validate=True)
    extensao = mimetypes.guess_extension(mimetype) or ''
    nome_objeto = criar_nome_objeto(prefixo, nome_original, identificador, extensao)

    return salvar_arquivo(BytesIO(conteudo), nome_objeto, mimetype)