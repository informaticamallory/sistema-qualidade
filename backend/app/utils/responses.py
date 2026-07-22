# utils/responses.py - Funções de resposta padronizada
from flask import jsonify
from datetime import datetime


def create_response(success=True, message="", data=None, errors=None, status_code=200):
    """Criar resposta padronizada da API"""
    response = {
        "success": success,
        "message": message,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    if data is not None:
        response["data"] = data
        
    if errors is not None:
        response["errors"] = errors
    
    return jsonify(response), status_code
