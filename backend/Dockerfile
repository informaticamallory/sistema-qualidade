FROM python:3.11-slim

# Instalar dependências do sistema
RUN apt-get update && apt-get install -y \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Criar diretório da aplicação
WORKDIR /app

# Copiar requirements e instalar dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código da aplicação
COPY . .

# Diretórios de escrita criados ANTES de trocar de usuário.
#
# 'uploads' é o ponto de montagem do volume do EasyPanel. Um volume montado
# num caminho que não existe na imagem é criado pelo Docker como root, e o
# processo, que roda como 'app', não consegue gravar — o sintoma é "permission
# denied" ao salvar a primeira foto. Existindo na imagem com a posse certa, o
# volume herda essa posse na primeira montagem.
RUN mkdir -p /app/logs /app/uploads/fotos /app/uploads/certificados

# Criar usuário não-root
RUN useradd --create-home --shell /bin/bash app \
    && chown -R app:app /app
USER app

# Expor porta
EXPOSE 5000

# Comando padrão
CMD ["gunicorn", "--config", "gunicorn.conf.py", "wsgi:app"]
