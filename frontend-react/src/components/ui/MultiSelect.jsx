import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './ui.css';

/* Seleção múltipla com busca, "(Selecionar Tudo)" e criação no lugar.

   No computador é um painel ancorado no campo. No celular vira folha de baixo,
   com fundo escurecido: o painel ancorado ficaria espremido contra o teclado, e
   o campo costuma estar no meio de um modal que já rola.

   props:
     opcoes        [{ id, rotulo }]
     selecionados  [id]
     onChange      (ids) => void
     onCriar       (texto) => Promise<{ id, rotulo } | null>. Ausente, não
                   oferece criação.
     rotuloVazio   texto do campo fechado sem nada escolhido
     titulo        cabeçalho da folha no celular
     id            liga o <label> de fora ao botão do campo */

const CELULAR = '(max-width: 768px)';

const semAcento = (valor) => String(valor ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function MultiSelect({
    opcoes = [],
    selecionados = [],
    onChange,
    onCriar,
    rotuloVazio = 'Selecione',
    titulo = 'Selecionar',
    id
}) {
    const [aberto, setAberto] = useState(false);
    const [busca, setBusca] = useState('');
    const [criando, setCriando] = useState(false);
    const [erro, setErro] = useState('');
    const [ehCelular, setEhCelular] = useState(false);

    const raizRef = useRef(null);
    const campoRef = useRef(null);
    const painelRef = useRef(null);
    const buscaRef = useRef(null);

    /* Onde desenhar o painel, em coordenadas de tela. Ele vai em portal e com
       `position: fixed` porque o campo vive dentro de `.modal-body`, que tem
       `overflow-y: auto`, dentro de um `.modal-content` com `overflow: hidden`.
       Ancorado no fluxo, o painel era cortado — medido: 282px de 354. */
    const [ancora, setAncora] = useState(null);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;
        const mq = window.matchMedia(CELULAR);
        const aplicar = () => setEhCelular(mq.matches);
        aplicar();
        mq.addEventListener('change', aplicar);
        return () => mq.removeEventListener('change', aplicar);
    }, []);

    /* Fecha ao clicar fora. No celular quem fecha é o fundo escurecido, que
       está em portal e portanto fora desta árvore. */
    useEffect(() => {
        if (!aberto || ehCelular) return undefined;
        /* O painel está em portal, fora da árvore do componente, então precisa
           ser checado à parte — pelo nó do DOM, e não pela propagação de
           eventos, que em portal não segue a árvore do React. */
        const fechar = (evento) => {
            const dentroDoCampo = raizRef.current?.contains(evento.target);
            const dentroDoPainel = painelRef.current?.contains(evento.target);
            if (!dentroDoCampo && !dentroDoPainel) setAberto(false);
        };
        document.addEventListener('mousedown', fechar);
        document.addEventListener('touchstart', fechar);
        return () => {
            document.removeEventListener('mousedown', fechar);
            document.removeEventListener('touchstart', fechar);
        };
    }, [aberto, ehCelular]);

    useEffect(() => {
        if (!aberto) return undefined;
        const aoTeclar = (e) => { if (e.key === 'Escape') setAberto(false); };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [aberto]);

    /* O corpo não rola atrás da folha aberta. */
    useEffect(() => {
        if (!aberto || !ehCelular) return undefined;
        const anterior = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = anterior; };
    }, [aberto, ehCelular]);

    /* Rolar ou redimensionar tira o campo de baixo do painel, que está preso à
       tela. Fechar é mais honesto do que reposicionar a cada quadro. */
    useEffect(() => {
        if (!aberto || ehCelular) return undefined;
        const fechar = () => setAberto(false);
        window.addEventListener('scroll', fechar, true);
        window.addEventListener('resize', fechar);
        return () => {
            window.removeEventListener('scroll', fechar, true);
            window.removeEventListener('resize', fechar);
        };
    }, [aberto, ehCelular]);

    const ALTURA_PAINEL = 360;

    const abrir = () => {
        setBusca('');
        setErro('');

        const caixa = campoRef.current?.getBoundingClientRect();
        if (caixa && !ehCelular) {
            /* Abre para cima quando não há espaço embaixo e há acima — é o caso
               do campo na última linha de um modal. */
            const abaixo = window.innerHeight - caixa.bottom;
            const paraCima = abaixo < ALTURA_PAINEL && caixa.top > abaixo;
            setAncora({
                left: caixa.left,
                width: caixa.width,
                top: paraCima ? undefined : caixa.bottom + 6,
                bottom: paraCima ? window.innerHeight - caixa.top + 6 : undefined,
                maxHeight: Math.max(160, (paraCima ? caixa.top : abaixo) - 16)
            });
        }

        setAberto(true);
        /* No computador o foco vai para a busca; no celular não, senão o
           teclado sobe antes de a lista aparecer. */
        if (!ehCelular) setTimeout(() => buscaRef.current?.focus(), 0);
    };

    const termo = semAcento(busca).trim();
    const filtradas = useMemo(
        () => (termo ? opcoes.filter((o) => semAcento(o.rotulo).includes(termo)) : opcoes),
        [opcoes, termo]);

    const escolhidos = useMemo(() => new Set(selecionados), [selecionados]);
    const rotulosEscolhidos = opcoes
        .filter((o) => escolhidos.has(o.id))
        .map((o) => o.rotulo);

    /* "(Selecionar Tudo)" age sobre o que está à vista, não sobre a lista
       inteira: com uma busca aplicada, marcar tudo o que não aparece seria uma
       surpresa. */
    const todasVisiveisMarcadas = filtradas.length > 0
        && filtradas.every((o) => escolhidos.has(o.id));

    const alternarTodas = () => {
        const proximo = new Set(escolhidos);
        filtradas.forEach((o) => (todasVisiveisMarcadas
            ? proximo.delete(o.id)
            : proximo.add(o.id)));
        onChange?.([...proximo]);
    };

    const alternar = (idOpcao) => {
        const proximo = new Set(escolhidos);
        if (proximo.has(idOpcao)) proximo.delete(idOpcao); else proximo.add(idOpcao);
        onChange?.([...proximo]);
    };

    /* Só oferece criar quando o que foi digitado não existe — nem entre o que
       está filtrado, nem no resto da lista. */
    const nomeNovo = busca.trim();
    const jaExiste = opcoes.some((o) => semAcento(o.rotulo) === termo);
    const podeCriar = !!onCriar && nomeNovo.length >= 2 && !jaExiste;

    const criar = async () => {
        if (!podeCriar || criando) return;
        setCriando(true);
        setErro('');
        try {
            const nova = await onCriar(nomeNovo);
            if (nova?.id != null) {
                onChange?.([...escolhidos, nova.id]);
                setBusca('');
            }
        } catch (e) {
            setErro(e?.message || 'Não foi possível criar.');
        } finally {
            setCriando(false);
        }
    };

    const lista = (
        <>
            <div className="ui-multiselect-busca">
                <i className="fas fa-search" aria-hidden="true"></i>
                <input
                    ref={buscaRef}
                    type="search"
                    className="form-control"
                    placeholder="Pesquisar..."
                    value={busca}
                    onChange={(e) => { setBusca(e.target.value); setErro(''); }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); criar(); }
                    }}
                    aria-label="Pesquisar na lista"
                />
            </div>

            <ul className="ui-multiselect-lista" role="listbox" aria-multiselectable="true">
                {filtradas.length > 0 && (
                    <li>
                        <label className="ui-multiselect-item ui-multiselect-todos">
                            <input type="checkbox" checked={todasVisiveisMarcadas}
                                onChange={alternarTodas} />
                            <span>(Selecionar Tudo)</span>
                        </label>
                    </li>
                )}

                {filtradas.map((opcao) => (
                    <li key={opcao.id}>
                        <label className="ui-multiselect-item">
                            <input type="checkbox" checked={escolhidos.has(opcao.id)}
                                onChange={() => alternar(opcao.id)} />
                            <span>{opcao.rotulo}</span>
                        </label>
                    </li>
                ))}

                {filtradas.length === 0 && !podeCriar && (
                    <li className="ui-multiselect-vazio">Nada encontrado.</li>
                )}
            </ul>

            {podeCriar && (
                <button type="button" className="ui-multiselect-criar"
                    onClick={criar} disabled={criando}>
                    <i className={`fas ${criando ? 'fa-spinner fa-spin' : 'fa-plus'}`}
                        aria-hidden="true"></i>
                    <span>Adicionar &ldquo;{nomeNovo}&rdquo;</span>
                </button>
            )}

            {erro && <p className="ui-multiselect-erro" role="alert">{erro}</p>}
        </>
    );

    return (
        <div className="ui-multiselect" ref={raizRef}>
            <button type="button" id={id} ref={campoRef}
                className="form-control ui-multiselect-campo"
                onClick={() => (aberto ? setAberto(false) : abrir())}
                aria-expanded={aberto} aria-haspopup="listbox">
                {rotulosEscolhidos.length === 0 ? (
                    <span className="ui-multiselect-placeholder">{rotuloVazio}</span>
                ) : (
                    /* Até três cabem como etiqueta; daí em diante vira contagem,
                       senão a altura do campo cresce sem limite. */
                    <span className="ui-multiselect-valor">
                        {rotulosEscolhidos.length <= 3
                            ? rotulosEscolhidos.map((rotulo) => (
                                <span className="ui-multiselect-chip" key={rotulo}>{rotulo}</span>
                            ))
                            : <span className="ui-multiselect-chip">
                                {rotulosEscolhidos.length} selecionados
                            </span>}
                    </span>
                )}
                <i className="fas fa-chevron-down ui-multiselect-seta" aria-hidden="true"></i>
            </button>

            {aberto && !ehCelular && typeof document !== 'undefined' && createPortal(
                /* Em portal e preso à tela, para escapar do recorte do modal. */
                <div className="ui-multiselect-painel" ref={painelRef}
                    role="dialog" aria-label={titulo}
                    style={ancora ? {
                        left: `${ancora.left}px`,
                        width: `${ancora.width}px`,
                        top: ancora.top != null ? `${ancora.top}px` : undefined,
                        bottom: ancora.bottom != null ? `${ancora.bottom}px` : undefined,
                        maxHeight: `${ancora.maxHeight}px`
                    } : undefined}>
                    {lista}
                </div>,
                document.body)}

            {aberto && ehCelular && typeof document !== 'undefined' && createPortal(
                <div className="ui-multiselect-fundo" onClick={() => setAberto(false)}>
                    <div className="ui-multiselect-folha" role="dialog" aria-label={titulo}
                        onClick={(e) => e.stopPropagation()}>
                        <header className="ui-multiselect-folha-topo">
                            <strong>{titulo}</strong>
                            <button type="button" onClick={() => setAberto(false)}
                                aria-label="Fechar">
                                <i className="fas fa-times" aria-hidden="true"></i>
                            </button>
                        </header>
                        {lista}
                        <button type="button" className="btn btn-primary ui-multiselect-pronto"
                            onClick={() => setAberto(false)}>
                            Pronto
                        </button>
                    </div>
                </div>,
                document.body)}
        </div>
    );
}
