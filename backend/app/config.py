# config.py - Configurações da aplicação
import os
from pathlib import Path
from datetime import timedelta
from urllib.parse import quote_plus
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / '.env')

load_dotenv()

class Config:
    """Configuração base"""
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')

    # JWT (autenticação)
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', SECRET_KEY)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(
        hours=int(os.getenv('JWT_EXPIRES_HOURS', 12))
    )

    # CORS - origens permitidas (separadas por vírgula). '*' libera tudo (apenas dev)
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', '*')

    # Banco de dados
    MYSQL_HOST = os.getenv('DB_HOST', 'localhost')
    MYSQL_USER = os.getenv('DB_USER', 'root')
    MYSQL_PASSWORD = os.getenv('DB_PASSWORD', '')
    MYSQL_DB = os.getenv('DB_NAME', 'sistema_mallory')
    MYSQL_PORT = int(os.getenv('DB_PORT', 3306))
    
    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{quote_plus(MYSQL_USER)}:{quote_plus(MYSQL_PASSWORD)}@"
        f"{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}?charset=utf8mb4"
    )
    
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,
        'pool_timeout': 20,
        'pool_recycle': 3600,
        'max_overflow': 5,
        'pool_pre_ping': True
    }
    
    # Rate Limiting
    # Default generoso: sistema interno com dashboards em polling (a cada 30s).
    # O limite anterior (50/hora) derrubava o dashboard com 429 em ~25 min.
    # Endpoints sensíveis (login/verify-admin) têm limites próprios mais rígidos.
    RATELIMIT_STORAGE_URL = os.getenv('REDIS_URL', 'memory://')
    RATELIMIT_DEFAULT = os.getenv('RATELIMIT_DEFAULT', '120 per minute')
    
    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

    # Cloudflare R2
    R2_ACCOUNT_ID = os.getenv('R2_ACCOUNT_ID') or os.getenv('CLOUDFLARE_ACCOUNT_ID', '')
    R2_ENDPOINT_URL = os.getenv('R2_ENDPOINT_URL') or (
        f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com" if R2_ACCOUNT_ID else ''
    )
    R2_ACCESS_KEY_ID = os.getenv('R2_ACCESS_KEY_ID', '')
    R2_SECRET_ACCESS_KEY = os.getenv('R2_SECRET_ACCESS_KEY', '')
    R2_BUCKET_NAME = os.getenv('R2_BUCKET_NAME', '')
    R2_PUBLIC_URL = os.getenv('R2_PUBLIC_URL', '').rstrip('/')
    R2_ENABLED = all([
        R2_ENDPOINT_URL,
        R2_ACCESS_KEY_ID,
        R2_SECRET_ACCESS_KEY,
        R2_BUCKET_NAME,
        R2_PUBLIC_URL
    ])
    
    # Paginação
    POSTS_PER_PAGE = 50
    MAX_POSTS_PER_PAGE = 100


class DevelopmentConfig(Config):
    """Configuração para desenvolvimento"""
    DEBUG = True
    SQLALCHEMY_ECHO = False


class ProductionConfig(Config):
    """Configuração para produção"""
    DEBUG = False
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'


class TestingConfig(Config):
    """Configuração para testes"""
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    # SQLite não aceita as opções de pool do MySQL (pool_size, max_overflow...)
    SQLALCHEMY_ENGINE_OPTIONS = {}


config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}
