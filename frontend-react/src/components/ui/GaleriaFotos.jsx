import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* Galeria de fotos de evidência: cabeçalho, miniaturas e visualizador.

   Saiu de dentro da Inspeção de Montagem, onde o campo e o visualizador eram
   ~150 linhas soltas no meio do formulário. As classes `.injecao-photo-*` e
   `.lightbox-*` continuam no CSS daquela página, que o Vite junta num arquivo
   só — as regras já valem para o sistema inteiro.

   O visualizador é onde ficam as setas e a contagem "2 / 3"; na faixa de
   miniaturas não há setas nem bolinhas, e nunca houve.

   props:
     titulo, descricao   cabeçalho do bloco
     fotos               [{ src, nome }]
     onChange            (fotos) => void — a lista inteira, já atualizada
     max                 quantas cabem (3 na Montagem, 1 na FNC)
     rotuloAdicionar     texto do botão quando ainda não há foto
     somenteLeitura      esconde adicionar e remover */

const LIMITE_LADO = 1600;      // px do maior lado depois de reduzir
const LIMITE_ARQUIVO = 15 * 1024 * 1024;

export default function GaleriaFotos({
    titulo,
    descricao,
    fotos = [],
    onChange,
    max = 3,
    rotuloAdicionar = 'Tirar foto',
    somenteLeitura = false
}) {
    const entradaRef = useRef(null);

    const [lightbox, setLightbox] = useState({ aberto: false, index: 0 });
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const arrastando = useRef(false);
    const inicioArrasto = useRef({ x: 0, y: 0 });
    const panInicial = useRef({ x: 0, y: 0 });
    const ultimoToque = useRef(0);
    const distanciaPinca = useRef(null);
    const zoomPinca = useRef(1);

    const cheio = fotos.length >= max;

    /* ── Visualizador ── */
    const abrir = (index) => { setLightbox({ aberto: true, index }); setZoom(1); setPan({ x: 0, y: 0 }); };
    const fechar = () => { setLightbox({ aberto: false, index: 0 }); setZoom(1); setPan({ x: 0, y: 0 }); };
    const navegar = (direcao) => {
        setLightbox((prev) => ({ ...prev, index: (prev.index + direcao + fotos.length) % fotos.length }));
        setZoom(1); setPan({ x: 0, y: 0 });
    };
    const alternarZoom = () => setZoom((z) => {
        const proximo = z >= 2.5 ? 1 : z + 1;
        if (proximo === 1) setPan({ x: 0, y: 0 });
        return proximo;
    });

    const aoGirarRoda = (e) => {
        e.preventDefault();
        setZoom((z) => {
            const proximo = Math.min(5, Math.max(1, z - e.deltaY * 0.002));
            if (proximo <= 1) setPan({ x: 0, y: 0 });
            return proximo;
        });
    };

    const aoApontarBaixo = (e) => {
        if (e.pointerType === 'touch' || zoom <= 1) return;
        arrastando.current = true;
        inicioArrasto.current = { x: e.clientX, y: e.clientY };
        panInicial.current = { ...pan };
        e.currentTarget.setPointerCapture(e.pointerId);
    };
    const aoApontarMover = (e) => {
        if (!arrastando.current) return;
        setPan({
            x: panInicial.current.x + (e.clientX - inicioArrasto.current.x),
            y: panInicial.current.y + (e.clientY - inicioArrasto.current.y)
        });
    };
    const aoApontarCima = () => { arrastando.current = false; };

    const aoTocarInicio = (e) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            distanciaPinca.current = Math.hypot(dx, dy);
            zoomPinca.current = zoom;
            return;
        }
        if (e.touches.length === 1) {
            const agora = Date.now();
            /* Dois toques rápidos alternam o zoom, como num app de fotos. */
            if (agora - ultimoToque.current < 300) { alternarZoom(); ultimoToque.current = 0; return; }
            ultimoToque.current = agora;
            if (zoom > 1) {
                arrastando.current = true;
                inicioArrasto.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                panInicial.current = { ...pan };
            }
        }
    };
    const aoTocarMover = (e) => {
        if (e.touches.length === 2 && distanciaPinca.current !== null) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const proximo = Math.min(5, Math.max(1,
                zoomPinca.current * (Math.hypot(dx, dy) / distanciaPinca.current)));
            setZoom(proximo);
            if (proximo <= 1) setPan({ x: 0, y: 0 });
            return;
        }
        if (arrastando.current && e.touches.length === 1) {
            setPan({
                x: panInicial.current.x + (e.touches[0].clientX - inicioArrasto.current.x),
                y: panInicial.current.y + (e.touches[0].clientY - inicioArrasto.current.y)
            });
        }
    };
    const aoTocarFim = () => { arrastando.current = false; distanciaPinca.current = null; };

    useEffect(() => {
        if (!lightbox.aberto) return undefined;
        const aoTeclar = (e) => {
            if (e.key === 'Escape') fechar();
            if (e.key === 'ArrowRight') navegar(1);
            if (e.key === 'ArrowLeft') navegar(-1);
            if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(5, z + 0.5));
            if (e.key === '-') setZoom((z) => { const n = Math.max(1, z - 0.5); if (n <= 1) setPan({ x: 0, y: 0 }); return n; });
        };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lightbox.aberto, fotos.length]);

    /* Foto de celular passa de 5 MB com facilidade, e o campo vai para o banco
       como texto. Reduzir o maior lado a 1600px e recomprimir em JPEG mantém a
       evidência legível com uma fração do tamanho. */
    const aoEscolherArquivo = (evento) => {
        if (cheio) {
            alert(max === 1
                ? 'Remova a foto atual antes de anexar outra.'
                : `Você pode registrar no máximo ${max} fotos.`);
            evento.target.value = '';
            return;
        }
        const arquivo = evento.target.files?.[0];
        if (!arquivo) return;
        if (!arquivo.type.startsWith('image/')) { alert('Selecione uma imagem válida.'); return; }
        if (arquivo.size > LIMITE_ARQUIVO) { alert('A imagem deve ter no máximo 15 MB.'); return; }

        const leitor = new FileReader();
        leitor.onload = () => {
            const imagem = new Image();
            imagem.onload = () => {
                const escala = Math.min(1, LIMITE_LADO / Math.max(imagem.width, imagem.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(imagem.width * escala));
                canvas.height = Math.max(1, Math.round(imagem.height * escala));
                canvas.getContext('2d').drawImage(imagem, 0, 0, canvas.width, canvas.height);
                onChange?.([...fotos, {
                    src: canvas.toDataURL('image/jpeg', 0.8),
                    nome: arquivo.name.slice(0, 70)
                }].slice(0, max));
                if (entradaRef.current) entradaRef.current.value = '';
            };
            imagem.onerror = () => alert('Não foi possível processar a imagem.');
            imagem.src = String(leitor.result || '');
        };
        leitor.onerror = () => alert('Não foi possível ler a imagem.');
        leitor.readAsDataURL(arquivo);
    };

    const remover = (index) => {
        onChange?.(fotos.filter((_, i) => i !== index));
        if (entradaRef.current) entradaRef.current.value = '';
    };

    const fotoAtual = fotos[lightbox.index];

    return (
        <div className="injecao-photo-field" style={{ gridColumn: '1 / -1' }}>
            <div className="injecao-photo-header">
                <div>
                    <strong><i className="fas fa-camera" aria-hidden="true"></i> {titulo}</strong>
                    {descricao && <small>{descricao}</small>}
                </div>
                {!somenteLeitura && (
                    <div className="injecao-photo-actions">
                        <label className={`btn btn-primary btn-sm ${cheio ? 'disabled' : ''}`}>
                            <i className="fas fa-camera" aria-hidden="true"></i>
                            {fotos.length ? 'Adicionar foto' : rotuloAdicionar}
                            {/* A contagem só faz sentido onde cabe mais de uma. */}
                            {max > 1 && ` (${fotos.length}/${max})`}
                            <input ref={entradaRef} type="file" accept="image/*" capture="environment"
                                onChange={aoEscolherArquivo} disabled={cheio} hidden />
                        </label>
                    </div>
                )}
            </div>

            {fotos.length ? (
                <div className="injecao-photo-preview-grid">
                    {fotos.map((foto, index) => (
                        <div className="injecao-photo-preview" key={`${foto.nome || 'foto'}-${index}`}>
                            <img src={foto.src} alt={foto.nome || `Foto ${index + 1}`}
                                onClick={() => abrir(index)} style={{ cursor: 'zoom-in' }} />
                            <span title={foto.nome}>{foto.nome || `Foto ${index + 1}`}</span>
                            {!somenteLeitura && (
                                <button type="button" onClick={() => remover(index)}
                                    aria-label={`Remover foto ${index + 1}`} title="Remover foto">
                                    <i className="fas fa-trash"></i>
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            ) : somenteLeitura ? (
                <div className="injecao-photo-empty">
                    <i className="fas fa-image" aria-hidden="true"></i>
                    <span>Nenhuma foto registrada</span>
                </div>
            ) : (
                /* O vazio é o próprio seletor: tocar em qualquer ponto dele
                   abre a câmera, sem obrigar a mirar no botão do cabeçalho. */
                <label className="injecao-photo-empty">
                    <i className="fas fa-camera" aria-hidden="true"></i>
                    <span>Nenhuma foto registrada — toque para adicionar</span>
                    <input type="file" accept="image/*" capture="environment"
                        onChange={aoEscolherArquivo} hidden />
                </label>
            )}

            {lightbox.aberto && fotoAtual && typeof document !== 'undefined' && createPortal((
                <div className="lightbox-overlay" onClick={fechar} role="dialog" aria-modal="true"
                    aria-label="Visualizar foto ampliada">
                    <div className="lightbox-controls-top">
                        <span className="lightbox-counter">{lightbox.index + 1} / {fotos.length}</span>
                        <div className="lightbox-zoom-controls">
                            <button type="button" onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(1, z - 0.5)); }}
                                aria-label="Reduzir zoom"><i className="fas fa-minus"></i></button>
                            <span className="lightbox-zoom-level">{Math.round(zoom * 100)}%</span>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(5, z + 0.5)); }}
                                aria-label="Aumentar zoom"><i className="fas fa-plus"></i></button>
                        </div>
                        <button type="button" className="lightbox-close" onClick={fechar}
                            aria-label="Fechar" title="Fechar (Esc)"><i className="fas fa-times"></i></button>
                    </div>

                    {fotos.length > 1 && (<>
                        <button type="button" className="lightbox-nav lightbox-prev"
                            onClick={(e) => { e.stopPropagation(); navegar(-1); }} aria-label="Foto anterior">
                            <i className="fas fa-chevron-left"></i>
                        </button>
                        <button type="button" className="lightbox-nav lightbox-next"
                            onClick={(e) => { e.stopPropagation(); navegar(1); }} aria-label="Próxima foto">
                            <i className="fas fa-chevron-right"></i>
                        </button>
                    </>)}

                    <div className="lightbox-image-wrapper" onClick={(e) => e.stopPropagation()}
                        onWheel={aoGirarRoda}
                        onPointerDown={aoApontarBaixo} onPointerMove={aoApontarMover}
                        onPointerUp={aoApontarCima} onPointerCancel={aoApontarCima}
                        onTouchStart={aoTocarInicio} onTouchMove={aoTocarMover} onTouchEnd={aoTocarFim}
                        onDoubleClick={alternarZoom}>
                        <img src={fotoAtual.src} alt={fotoAtual.nome || `Foto ${lightbox.index + 1}`}
                            className="lightbox-image" draggable={false}
                            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                                cursor: zoom > 1 ? 'grab' : 'zoom-in' }} />
                    </div>
                    <div className="lightbox-caption">{fotoAtual.nome || `Foto ${lightbox.index + 1}`}</div>
                </div>
            ), document.body)}
        </div>
    );
}
