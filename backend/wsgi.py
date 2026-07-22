# wsgi.py - Entry point para produção (Gunicorn)
from app import create_app, criar_admin_padrao, db

app = create_app('production')

with app.app_context():
    db.create_all()
    criar_admin_padrao(app)
