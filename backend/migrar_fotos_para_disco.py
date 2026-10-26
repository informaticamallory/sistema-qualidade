"""Move para disco as fotos que estão gravadas em base64 dentro do banco.

Rodar DEPOIS de o volume existir no EasyPanel, pelo terminal do serviço:

    python migrar_fotos_para_disco.py --simular     # só relata, não grava
    python migrar_fotos_para_disco.py               # converte de verdade

Pode rodar quantas vezes quiser: registro que já aponta para arquivo é
pulado. Nada é apagado — o valor da coluna só é trocado depois que o arquivo
está gravado em disco, e cada tabela é salva em lotes, de modo que uma falha
no meio não desfaz o que já passou.
"""
import argparse
import sys

from app import create_app
from app.extensions import db
from app.services.armazenamento import eh_data_url, normalizar_fotos

# (modelo, coluna da foto, subpasta, atributo que identifica o registro)
ALVOS = [
    ('app.models.registro', 'RegistroInspecao', 'foto_peca', 'montagem', 'cod_sap'),
    ('app.models.injecao', 'RegistroInjecao', 'foto_peca', 'injecao', 'cod'),
    ('app.models.recebimento', 'FichaRecebimento', 'foto_peca', 'recebimento', 'cod_sap'),
    ('app.models.ficha_nc', 'FichaNC', 'evidencia_foto', 'fichas-nc', 'numero_fnc'),
    ('app.models.resumo_bloqueio', 'ResumoBloqueioLinha', 'evidencia_dados', 'resumo-bloqueio', 'produto'),
]

LOTE = 50


def _tem_base64(valor):
    """Vale tanto para foto única quanto para a lista em JSON."""
    texto = str(valor or '')
    return 'data:image/' in texto or eh_data_url(texto)


def migrar(simular=False):
    total_geral = {'convertidos': 0, 'pulados': 0, 'erros': 0}

    for caminho_modulo, nome_classe, coluna, subpasta, campo_id in ALVOS:
        modulo = __import__(caminho_modulo, fromlist=[nome_classe])
        Modelo = getattr(modulo, nome_classe)

        registros = Modelo.query.filter(getattr(Modelo, coluna).isnot(None)).all()
        convertidos = pulados = erros = 0

        for indice, registro in enumerate(registros, start=1):
            valor = getattr(registro, coluna)

            if not _tem_base64(valor):
                pulados += 1
                continue

            if simular:
                convertidos += 1
                continue

            try:
                novo = normalizar_fotos(valor, subpasta, getattr(registro, campo_id, None))
                # Só troca se algo saiu diferente: assim um valor que o
                # conversor não reconheceu fica como está, em vez de virar
                # string vazia.
                if novo and novo != valor:
                    setattr(registro, coluna, novo)
                    convertidos += 1
                else:
                    pulados += 1
            except Exception as e:
                erros += 1
                print(f'  ! {nome_classe} id={registro.id}: {e}')

            if indice % LOTE == 0:
                db.session.commit()

        if not simular:
            db.session.commit()

        print(f'{nome_classe:22} convertidos={convertidos:5}  pulados={pulados:5}  erros={erros}')
        total_geral['convertidos'] += convertidos
        total_geral['pulados'] += pulados
        total_geral['erros'] += erros

    return total_geral


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--simular', action='store_true',
                        help='conta o que seria convertido, sem gravar nada')
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        if args.simular:
            print('MODO SIMULAÇÃO — nada será gravado\n')
        total = migrar(simular=args.simular)

    print(f"\nTotal: {total['convertidos']} convertidos, "
          f"{total['pulados']} pulados, {total['erros']} erros")
    sys.exit(1 if total['erros'] else 0)
