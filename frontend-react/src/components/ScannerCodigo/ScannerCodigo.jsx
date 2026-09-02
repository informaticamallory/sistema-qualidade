import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './ScannerCodigo.css';

/* Leitor de código de barras / QR pela câmera do aparelho.

   Dois decodificadores, nesta ordem:

   1. BarcodeDetector, a API nativa do navegador. Onde existe (Chrome no
      Android, que é o caso dos tablets de fábrica) a decodificação roda em
      código nativo: pega o código mais rápido, aguenta ângulo e luz pior, e
      não pesa nada no pacote.

   2. ZXing, carregado por import dinâmico, para quem não tem a nativa —
      Safari no iOS, sobretudo. Fica fora do pacote principal e só é baixado
      quando alguém abre a câmera.

   Formatos: EAN-13, Code 128 e QR, mais os vizinhos que saem de graça nas
   duas bibliotecas (EAN-8, UPC, Code 39, ITF, Data Matrix).

   props:
     aberto      controla a exibição
     onLer       (codigo, formato) => void — chamado uma vez, no primeiro
                 código válido; o componente para a câmera em seguida
     onFechar    () => void
     titulo      texto do cabeçalho */

/* Também usados como constraints do BarcodeDetector nativo. */
const FORMATOS_NATIVOS = [
    'ean_13', 'ean_8', 'upc_a', 'upc_e',
    'code_128', 'code_39', 'itf',
    'qr_code', 'data_matrix'
];

const MENSAGENS_ERRO = {
    NotAllowedError: 'Acesso à câmera negado. Para liberar, toque no ícone de câmera ou no cadeado na barra de endereço e permita o acesso — depois abra o leitor de novo.',
    PermissionDeniedError: 'Acesso à câmera negado. Libere a permissão nas configurações do navegador e tente novamente.',
    NotFoundError: 'Nenhuma câmera encontrada neste aparelho. Digite o código manualmente.',
    DevicesNotFoundError: 'Nenhuma câmera encontrada neste aparelho. Digite o código manualmente.',
    NotReadableError: 'A câmera está em uso por outro aplicativo. Feche o outro app e tente de novo.',
    TrackStartError: 'A câmera está em uso por outro aplicativo. Feche o outro app e tente de novo.',
    OverconstrainedError: 'A câmera deste aparelho não atende ao formato pedido. Digite o código manualmente.',
    SecurityError: 'O navegador bloqueou a câmera por segurança. A página precisa ser servida por HTTPS.'
};

const erroLegivel = (e) => {
    if (!e) return 'Não foi possível abrir a câmera.';
    /* A checagem de contexto seguro vem antes do nome do erro: sem HTTPS o
       navegador nem expõe mediaDevices, e a mensagem genérica não ajudaria. */
    if (!window.isSecureContext) {
        return 'A câmera só funciona em conexão segura (HTTPS). Acesse o sistema pelo endereço https:// para usar o leitor.';
    }
    return MENSAGENS_ERRO[e.name] || `Não foi possível abrir a câmera (${e.name || 'erro desconhecido'}).`;
};

export default function ScannerCodigo({
    aberto,
    onLer,
    onFechar,
    titulo = 'Ler código de barras'
}) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const pararRef = useRef(null);
    /* Guarda o encerramento: o callback de leitura pode disparar mais de uma
       vez antes de a câmera parar, e o campo não deve ser preenchido duas
       vezes com leituras diferentes. */
    const encerradoRef = useRef(false);

    const [estado, setEstado] = useState('iniciando');
    const [erro, setErro] = useState('');
    const [lanternaLigada, setLanternaLigada] = useState(false);
    const [temLanterna, setTemLanterna] = useState(false);
    const [motor, setMotor] = useState('');

    const pararTudo = useCallback(() => {
        try { pararRef.current?.(); } catch { /* decodificador já parado */ }
        pararRef.current = null;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
    }, []);

    const aoLerCodigo = useCallback((texto, formato) => {
        const codigo = String(texto || '').trim();
        if (!codigo || encerradoRef.current) return;
        encerradoRef.current = true;

        /* Confirmação de leitura sem depender de som: em fábrica o aparelho
           costuma estar no silencioso e o ambiente é barulhento. */
        try { navigator.vibrate?.(60); } catch { /* sem suporte a vibração */ }

        setEstado('lido');
        pararTudo();
        /* Deixa o retorno visual aparecer antes de fechar. */
        setTimeout(() => {
            onLer?.(codigo, formato || '');
            onFechar?.();
        }, 320);
    }, [onLer, onFechar, pararTudo]);

    /* ── Lanterna: decisiva em galpão com luz fraca ── */
    const alternarLanterna = async () => {
        const track = streamRef.current?.getVideoTracks?.()[0];
        if (!track) return;
        const alvo = !lanternaLigada;
        try {
            await track.applyConstraints({ advanced: [{ torch: alvo }] });
            setLanternaLigada(alvo);
        } catch {
            setTemLanterna(false);
        }
    };

    useEffect(() => {
        if (!aberto) return;

        let cancelado = false;
        encerradoRef.current = false;
        setEstado('iniciando');
        setErro('');
        setLanternaLigada(false);
        setTemLanterna(false);
        setMotor('');

        const iniciar = async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
                setErro(erroLegivel({ name: 'SecurityError' }));
                setEstado('erro');
                return;
            }

            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        /* Traseira: é a que aponta para a peça. */
                        facingMode: { ideal: 'environment' },
                        /* Resolução alta ajuda em Code 128 de barra fina, que é
                           o que mais falha em etiqueta pequena. */
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        focusMode: { ideal: 'continuous' }
                    },
                    audio: false
                });
            } catch (e) {
                if (cancelado) return;
                setErro(erroLegivel(e));
                setEstado('erro');
                return;
            }

            if (cancelado) {
                stream.getTracks().forEach((t) => t.stop());
                return;
            }

            streamRef.current = stream;
            const video = videoRef.current;
            if (!video) return;

            video.srcObject = stream;
            /* iOS exige os dois para tocar embutido, sem abrir em tela cheia. */
            video.setAttribute('playsinline', 'true');
            video.muted = true;
            try {
                await video.play();
            } catch {
                /* Alguns navegadores rejeitam o play mas seguem exibindo. */
            }

            const track = stream.getVideoTracks()[0];
            const capacidades = track?.getCapabilities?.() || {};
            if (capacidades.torch) setTemLanterna(true);

            if (cancelado) return;
            setEstado('lendo');

            /* ── 1) API nativa ── */
            if ('BarcodeDetector' in window) {
                try {
                    const suportados = await window.BarcodeDetector.getSupportedFormats();
                    const formatos = FORMATOS_NATIVOS.filter((f) => suportados.includes(f));
                    if (formatos.length) {
                        const detector = new window.BarcodeDetector({ formats: formatos });
                        setMotor('nativo');

                        let rodando = true;
                        pararRef.current = () => { rodando = false; };

                        const varrer = async () => {
                            if (!rodando || cancelado || encerradoRef.current) return;
                            try {
                                const achados = await detector.detect(video);
                                if (achados?.length) {
                                    aoLerCodigo(achados[0].rawValue, achados[0].format);
                                    return;
                                }
                            } catch {
                                /* Quadro ilegível (foco, movimento): tenta o próximo. */
                            }
                            /* rAF em vez de setInterval: acompanha o vídeo e não
                               acumula fila quando um quadro demora. */
                            if (rodando) requestAnimationFrame(varrer);
                        };
                        requestAnimationFrame(varrer);
                        return;
                    }
                } catch {
                    /* Cai para o ZXing. */
                }
            }

            /* ── 2) ZXing, carregado só agora ── */
            try {
                const { BrowserMultiFormatReader } = await import('@zxing/browser');
                if (cancelado || encerradoRef.current) return;

                const leitor = new BrowserMultiFormatReader();
                setMotor('zxing');

                /* Decodifica o <video> que já está com o nosso stream, para a
                   lanterna continuar sob nosso controle. */
                const controles = await leitor.decodeFromVideoElement(video, (resultado) => {
                    if (resultado) {
                        aoLerCodigo(resultado.getText(), resultado.getBarcodeFormat?.());
                    }
                });
                pararRef.current = () => {
                    try { controles?.stop?.(); } catch { /* já parado */ }
                };
            } catch (e) {
                if (cancelado) return;
                setErro(`Não foi possível carregar o leitor de códigos (${e?.message || 'falha de rede'}). Digite o código manualmente.`);
                setEstado('erro');
            }
        };

        iniciar();

        return () => {
            cancelado = true;
            pararTudo();
        };
    }, [aberto, aoLerCodigo, pararTudo]);

    /* Esc fecha, como nos outros modais do sistema. */
    useEffect(() => {
        if (!aberto) return;
        const aoTeclar = (e) => { if (e.key === 'Escape') onFechar?.(); };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, [aberto, onFechar]);

    if (!aberto) return null;

    /* Portal: o modal de inspeção tem transform e max-width, que quebrariam
       o posicionamento fixo aqui dentro. */
    return createPortal(
        <div className="scanner-overlay" role="dialog" aria-modal="true" aria-label={titulo}>
            <div className="scanner-caixa">
                <header className="scanner-topo">
                    <h2><i className="fas fa-barcode" aria-hidden="true"></i> {titulo}</h2>
                    <button type="button" className="scanner-fechar" onClick={onFechar}
                        aria-label="Fechar leitor">
                        <i className="fas fa-times" aria-hidden="true"></i>
                    </button>
                </header>

                <div className={`scanner-palco ${estado === 'lido' ? 'is-lido' : ''}`}>
                    <video ref={videoRef} className="scanner-video"
                        playsInline muted autoPlay />

                    {estado === 'lendo' && (
                        <div className="scanner-mira" aria-hidden="true">
                            <span className="scanner-canto ct-tl"></span>
                            <span className="scanner-canto ct-tr"></span>
                            <span className="scanner-canto ct-bl"></span>
                            <span className="scanner-canto ct-br"></span>
                            <span className="scanner-linha"></span>
                        </div>
                    )}

                    {estado === 'iniciando' && (
                        <p className="scanner-aviso">
                            <i className="fas fa-spinner fa-spin" aria-hidden="true"></i> Abrindo a câmera…
                        </p>
                    )}

                    {estado === 'lido' && (
                        <p className="scanner-aviso scanner-ok" role="status">
                            <i className="fas fa-check-circle" aria-hidden="true"></i> Código lido
                        </p>
                    )}

                    {estado === 'erro' && (
                        <div className="scanner-erro" role="alert">
                            <i className="fas fa-triangle-exclamation" aria-hidden="true"></i>
                            <p>{erro}</p>
                        </div>
                    )}
                </div>

                <footer className="scanner-rodape">
                    <p className="scanner-dica">
                        {estado === 'erro'
                            ? 'O campo continua aceitando digitação e leitor físico.'
                            : 'Encoste a etiqueta na área marcada. Se a luz estiver fraca, ligue a lanterna.'}
                    </p>
                    <div className="scanner-acoes">
                        {temLanterna && estado === 'lendo' && (
                            <button type="button"
                                className={`btn btn-outline ${lanternaLigada ? 'is-ativo' : ''}`}
                                onClick={alternarLanterna}
                                aria-pressed={lanternaLigada}>
                                <i className="fas fa-lightbulb" aria-hidden="true"></i>
                                {lanternaLigada ? ' Desligar lanterna' : ' Lanterna'}
                            </button>
                        )}
                        <button type="button" className="btn btn-outline" onClick={onFechar}>
                            Digitar manualmente
                        </button>
                    </div>
                    {motor && estado === 'lendo' && (
                        <span className="scanner-motor">
                            {motor === 'nativo' ? 'Leitor do sistema' : 'Leitor do navegador'}
                        </span>
                    )}
                </footer>
            </div>
        </div>,
        document.body
    );
}
