# run.py - Entry point da aplicação
import os
from app import create_app, criar_admin_padrao, db

# Criar aplicação
app = create_app()

if __name__ == '__main__':
    print("=" * 60)
    print("🚀 Iniciando Sistema MALLORY - Backend Otimizado")
    print("=" * 60)
    print("Versão: 2.0.0")
    print("Banco de dados: sistema_mallory")
    print("Servidor: http://localhost:5000")
    print("=" * 60)
    
    with app.app_context():
        # Criar tabelas (se não existirem)
        db.create_all()
        
        # Criar admin padrão
        criar_admin_padrao(app)
    
    # Iniciar servidor de desenvolvimento
    app.run(host='0.0.0.0', port=5000, debug=True)
