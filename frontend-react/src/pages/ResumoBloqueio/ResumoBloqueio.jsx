import { useEffect, useRef, useState } from 'react';
import Sidebar from '../../components/Sidebar/Sidebar';
import { resumoBloqueioAPI } from '../../services/api';
import './ResumoBloqueio.css';

const todayISO = () => {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return localDate.toISOString().split('T')[0];
};

const emptyRow = () => ({
    id: Date.now() + Math.random(),
    turno: '',
    qtd: '',
    produto: '',
    peca: '',
    defeito: '',
    evidencia: null,
    evidenciaPreview: ''
});

const upperFields = ['turno', 'produto', 'peca', 'defeito'];

const SHIFT_CONFIG = {
    A: {
        label: 'Turno A',
        start: '06:00',
        end: '14:30',
        color: 'var(--primary)',
    },
    B: {
        label: 'Turno B',
        start: '14:30',
        end: '22:30',
        color: 'var(--info, #2563eb)',
    },
    C: {
        label: 'Turno C',
        start: '22:30',
        end: '06:00',
        color: 'var(--success, #16a34a)',
    },
};

const resizeTextarea = (element) => {
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
};

const normalizeRows = (rows = []) => (
    rows.length
        ? rows.map((row) => ({
            id: row.id || Date.now() + Math.random(),
            turno: row.turno || '',
            qtd: row.qtd ?? '',
            produto: row.produto || '',
            peca: row.peca || '',
            defeito: row.defeito || '',
            evidencia: row.evidencia || null,
            evidenciaPreview: row.evidenciaPreview || row.evidencia?.url || ''
        }))
        : [emptyRow()]
);

const hasMeaningfulRows = (rows = []) => rows.some((row) => (
    row.turno || row.qtd || row.produto || row.peca || row.defeito || row.evidenciaPreview
));

const hasRowContent = (row) => (
    row.qtd || row.produto || row.peca || row.defeito || row.evidenciaPreview
);

const formatDateBR = (isoDate) => {
    if (!isoDate) return '';
    const [year, month, day] = isoDate.split('-');
    return [day, month, year].filter(Boolean).join('/');
};

const safeFilePart = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

const CP1252_CHARS = {
    'Á': 193, 'À': 192, 'Â': 194, 'Ã': 195, 'Ä': 196,
    'á': 225, 'à': 224, 'â': 226, 'ã': 227, 'ä': 228,
    'É': 201, 'È': 200, 'Ê': 202, 'Ë': 203,
    'é': 233, 'è': 232, 'ê': 234, 'ë': 235,
    'Í': 205, 'Ì': 204, 'Î': 206, 'Ï': 207,
    'í': 237, 'ì': 236, 'î': 238, 'ï': 239,
    'Ó': 211, 'Ò': 210, 'Ô': 212, 'Õ': 213, 'Ö': 214,
    'ó': 243, 'ò': 242, 'ô': 244, 'õ': 245, 'ö': 246,
    'Ú': 218, 'Ù': 217, 'Û': 219, 'Ü': 220,
    'ú': 250, 'ù': 249, 'û': 251, 'ü': 252,
    'Ç': 199, 'ç': 231, 'Ñ': 209, 'ñ': 241,
    'º': 186, 'ª': 170, '°': 176, '–': 45, '—': 45, '“': 34, '”': 34, '’': 39
};

const escapePdfText = (value) => Array.from(String(value ?? '')).map((char) => {
    const code = char.charCodeAt(0);
    if (code >= 32 && code <= 126) return char;
    if (CP1252_CHARS[char]) return String.fromCharCode(CP1252_CHARS[char]);
    return '?';
}).join('').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

const wrapText = (text, maxChars) => {
    const words = String(text || '-').split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';

    words.forEach((word) => {
        if (!current) {
            current = word;
        } else if (`${current} ${word}`.length <= maxChars) {
            current = `${current} ${word}`;
        } else {
            lines.push(current);
            current = word;
        }
    });

    if (current) lines.push(current);
    return lines.length ? lines : ['-'];
};

const bytesToBinaryString = (bytes) => {
    let result = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        result += String.fromCharCode(...bytes.slice(index, index + chunkSize));
    }
    return result;
};

const dataUrlToBytes = (dataUrl) => {
    const base64 = String(dataUrl || '').split(',')[1];
    if (!base64) return null;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
};

const loadEvidenceImage = (dataUrl) => new Promise((resolve) => {
    if (!dataUrl) {
        resolve(null);
        return;
    }

    const image = new Image();
    image.onload = () => {
        const maxWidth = 900;
        const scale = Math.min(1, maxWidth / image.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const jpegUrl = canvas.toDataURL('image/jpeg', 0.82);
        const bytes = dataUrlToBytes(jpegUrl);
        resolve(bytes ? { bytes, width: canvas.width, height: canvas.height } : null);
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
});

const createResumoPdfBlob = async ({ targetDate, shiftLabels, reportRows }) => {
    const pageWidth = 595;
    const pageHeight = 842;
    const margin = 40;
    const pages = [];
    const images = [];
    let pageItems = [];
    let y = pageHeight - margin;

    const newPage = () => {
        pages.push(pageItems);
        pageItems = [];
        y = pageHeight - margin;
    };

    const addText = (text, size = 10, indent = 0, gap = 14) => {
        const availableWidth = pageWidth - (margin * 2) - indent;
        const maxChars = Math.max(24, Math.floor(availableWidth / (size * 0.52)));
        wrapText(text, maxChars).forEach((line) => {
            if (y < margin) newPage();
            pageItems.push({ type: 'text', text: line, size, x: margin + indent, y });
            y -= gap;
        });
    };

    const addImage = (image, indent = 12) => {
        if (!image) return;
        const maxWidth = pageWidth - (margin * 2) - indent;
        const maxHeight = 170;
        const ratio = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
        const width = Math.max(1, Math.round(image.width * ratio));
        const height = Math.max(1, Math.round(image.height * ratio));

        if (y - height < margin) newPage();
        y -= height;
        const imageIndex = images.push(image) - 1;
        pageItems.push({
            type: 'image',
            imageIndex,
            x: margin + indent,
            y,
            width,
            height
        });
        y -= 18;
    };

    const totalBloqueado = reportRows.reduce((total, row) => {
        const qtd = Number(row.qtd);
        return total + (Number.isFinite(qtd) ? qtd : 0);
    }, 0);

    const preparedRows = await Promise.all(reportRows.map(async (row) => ({
        ...row,
        pdfImage: await loadEvidenceImage(row.evidenciaPreview)
    })));

    addText('Resumo Diario de Bloqueio', 17, 0, 24);
    addText(`Data: ${formatDateBR(targetDate)}`, 11);
    addText(`Turno(s): ${shiftLabels}`, 11);
    addText(`Total bloqueado: ${totalBloqueado}`, 11, 0, 20);

    preparedRows.forEach((row, index) => {
        addText(`${index + 1}. Turno ${row.turno || '-'} | Qtd: ${row.qtd || '-'}`, 11, 0, 15);
        addText(`Produto: ${row.produto || '-'}`, 9, 12, 12);
        addText(`Peca: ${row.peca || '-'}`, 9, 12, 12);
        addText(`Defeito: ${row.defeito || '-'}`, 9, 12, 12);
        if (row.pdfImage) {
            addText('Evidencia:', 9, 12, 12);
            addImage(row.pdfImage, 12);
        } else {
            addText('Evidencia: -', 9, 12, 16);
        }
    });

    if (!pages.length || pageItems.length) pages.push(pageItems);

    const objects = [];
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';

    const imageObjectIds = images.map((image) => {
        const imageStream = bytesToBinaryString(image.bytes);
        const objectId = objects.length;
        objects[objectId] = `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n${imageStream}\nendstream`;
        return objectId;
    });

    const pageRefs = [];
    pages.forEach((items) => {
        const pageImages = [...new Set(items.filter((item) => item.type === 'image').map((item) => item.imageIndex))];
        const imageResources = pageImages.length
            ? ` /XObject << ${pageImages.map((index) => `/Im${index + 1} ${imageObjectIds[index]} 0 R`).join(' ')} >>`
            : '';
        const content = items.map((item) => {
            if (item.type === 'image') {
                return `q ${item.width} 0 0 ${item.height} ${item.x} ${item.y} cm /Im${item.imageIndex + 1} Do Q`;
            }
            return `BT /F1 ${item.size} Tf 1 0 0 1 ${item.x} ${item.y} Tm (${escapePdfText(item.text)}) Tj ET`;
        }).join('\n');
        const contentObj = objects.length;
        objects[contentObj] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
        const pageObj = objects.length;
        objects[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >>${imageResources} >> /Contents ${contentObj} 0 R >>`;
        pageRefs.push(`${pageObj} 0 R`);
    });

    objects[2] = `<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageRefs.length} >>`;

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    for (let index = 1; index < objects.length; index += 1) {
        offsets[index] = pdf.length;
        pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
    }

    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let index = 1; index < objects.length; index += 1) {
        pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    const bytes = Uint8Array.from(pdf, (char) => char.charCodeAt(0) & 0xff);
    return new Blob([bytes], { type: 'application/pdf' });
};
const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const buildOutlookBody = ({ targetDate, shiftLabels, fileName }) => ([
    'Olá,',
    '',
    `Segue o Resumo Diário de Bloqueio em PDF do dia ${formatDateBR(targetDate)}.`,
    `Turno(s): ${shiftLabels}.`,
    '',
    `Arquivo gerado: ${fileName}`,
    '',
    'Atenciosamente,'
].join('\n'));
export default function ResumoBloqueio() {
    const [date, setDate] = useState(() => todayISO());
    const [rows, setRows] = useState([emptyRow()]);
    const [loading, setLoading] = useState(true);
    const [saveState, setSaveState] = useState('idle');
    const [sendFeedback, setSendFeedback] = useState(null);
    const saveTimerRef = useRef(null);
    const feedbackTimerRef = useRef(null);
    const skipNextSaveRef = useRef(true);
    const currentDateRef = useRef(date);
    const rowsRef = useRef(rows);

    useEffect(() => {
        currentDateRef.current = date;
    }, [date]);

    useEffect(() => {
        rowsRef.current = rows;
    }, [rows]);



    useEffect(() => () => {
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    }, []);

    useEffect(() => {
        let active = true;

        const loadRows = async () => {
            try {
                setLoading(true);
                setSaveState('idle');
                const response = await resumoBloqueioAPI.getByDate(date);
                if (!active) return;

                skipNextSaveRef.current = true;
                setRows(normalizeRows(response.data?.data?.rows || []));
            } catch (error) {
                if (!active) return;
                console.error('Erro ao carregar resumo de bloqueio:', error);
                skipNextSaveRef.current = true;
                setRows([emptyRow()]);
                setSaveState('error');
            } finally {
                if (active) setLoading(false);
            }
        };

        loadRows();

        return () => {
            active = false;
        };
    }, [date]);

    const persistRows = async (targetDate, targetRows, options = {}) => {
        if (!targetDate) return;
        if (!hasMeaningfulRows(targetRows) && !options.force) {
            setSaveState('idle');
            return;
        }

        try {
            if (!options.silent) setSaveState('saving');
            const response = await resumoBloqueioAPI.saveByDate(targetDate, targetRows);
            const savedRows = response.data?.data?.rows;

            if (currentDateRef.current === targetDate && savedRows?.length) {
                skipNextSaveRef.current = true;
                setRows(normalizeRows(savedRows));
            }

            if (!options.silent) setSaveState('saved');
        } catch (error) {
            console.error('Erro ao salvar resumo de bloqueio:', error);
            if (!options.silent) setSaveState('error');
        }
    };

    useEffect(() => {
        document.querySelectorAll('.resumo-textarea').forEach(resizeTextarea);
    }, [rows, date]);

    useEffect(() => {
        if (loading) return;
        if (skipNextSaveRef.current) {
            skipNextSaveRef.current = false;
            return;
        }

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => {
            persistRows(date, rows);
        }, 700);

        return () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        };
    }, [rows, date, loading]);

    const updateRows = (updater) => {
        setRows((currentRows) => {
            const nextRows = typeof updater === 'function' ? updater(currentRows) : updater;
            return nextRows.length ? nextRows : [emptyRow()];
        });
    };

    const handleDateChange = (nextDate) => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        persistRows(date, rowsRef.current, { silent: true });
        skipNextSaveRef.current = true;
        setDate(nextDate);
    };

    const addRow = () => updateRows((currentRows) => [...currentRows, emptyRow()]);

    const removeRow = (id) => {
        updateRows((currentRows) => (
            currentRows.length === 1
                ? currentRows
                : currentRows.filter((row) => row.id !== id)
        ));
    };

    const updateRow = (id, field, value) => {
        const nextValue = upperFields.includes(field) ? String(value).toUpperCase() : value;
        updateRows((currentRows) => currentRows.map((row) => (
            row.id === id ? { ...row, [field]: nextValue } : row
        )));
    };

    const handleTextChange = (event, rowId, field) => {
        updateRow(rowId, field, event.target.value);
        resizeTextarea(event.target);
    };

    const openPhotoOptions = (rowId) => {
        document.getElementById(`photo-input-${rowId}`)?.click();
    };

    const handlePhotoSelect = (event, rowId) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const preview = String(reader.result || '');
            updateRows((currentRows) => currentRows.map((row) => (
                row.id === rowId
                    ? {
                        ...row,
                        evidencia: { url: preview, name: file.name },
                        evidenciaPreview: preview
                    }
                    : row
            )));
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    };

    const removePhoto = (rowId) => {
        updateRows((currentRows) => currentRows.map((row) => (
            row.id === rowId
                ? { ...row, evidencia: null, evidenciaPreview: '' }
                : row
        )));
    };

    const exportPdf = () => {
        window.print();
    };

    const normalizeShift = (val) => {
        const v = String(val || '').trim().toUpperCase();
        if (v.includes('A') || v === '1') return 'A';
        if (v.includes('B') || v === '2') return 'B';
        if (v.includes('C') || v === '3') return 'C';
        return null;
    };

    const getDetectedShifts = () => {
        const detected = rows
            .filter((row) => row.turno?.toString().trim() !== '')
            .map((row) => normalizeShift(row.turno))
            .filter(Boolean);

        return ['A', 'B', 'C'].filter((shift) => detected.includes(shift));
    };

    const detectedShifts = getDetectedShifts();

    const shiftColor = (val) => {
        const shift = normalizeShift(val);
        return shift ? SHIFT_CONFIG[shift].color : 'transparent';
    };

    const showToast = (message, type = 'success') => {
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        setSendFeedback({ message, type });
        feedbackTimerRef.current = setTimeout(() => setSendFeedback(null), 3500);
    };

    // TODO: Create backend endpoint POST /resumo-bloqueio/enviar
    // Expected payload:
    //   { date, shifts: string[], rows: Row[] }
    // The backend should validate permission, compose the final PDF/HTML,
    // route by shift, and log the send event with timestamp and user id.
    // Direct Outlook attachments from a browser are blocked by mailto security;
    // use Microsoft Graph, SMTP, or a local helper for fully automatic attachment.
    const handleSend = async () => {
        if (detectedShifts.length === 0) return;

        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

        const currentRows = rowsRef.current;
        await persistRows(currentDateRef.current, currentRows, { silent: true });

        const reportRows = currentRows.filter((row) => (
            detectedShifts.includes(normalizeShift(row.turno)) && hasRowContent(row)
        ));

        if (!reportRows.length) {
            showToast('Preencha ao menos uma linha do turno antes de enviar.', 'error');
            return;
        }

        const shiftLabels = detectedShifts.map((shift) => SHIFT_CONFIG[shift].label).join(' + ');
        const subject = `Resumo Diário de Bloqueio - ${formatDateBR(currentDateRef.current)} - ${shiftLabels}`;
        const fileName = `resumo-diario-bloqueio-${currentDateRef.current}-${safeFilePart(shiftLabels)}.pdf`;
        const body = buildOutlookBody({
            targetDate: currentDateRef.current,
            shiftLabels,
            fileName
        });
        const pdfBlob = await createResumoPdfBlob({
            targetDate: currentDateRef.current,
            shiftLabels,
            reportRows
        });

        const payload = {
            date: currentDateRef.current,
            shifts: detectedShifts,
            rows: reportRows.map((row) => ({
                turno: row.turno,
                qtd: row.qtd,
                produto: row.produto,
                peca: row.peca,
                defeito: row.defeito,
            }))
        };

        console.log('Sending report:', payload);
        downloadBlob(pdfBlob, fileName);
        window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        showToast('Outlook aberto e PDF com imagens gerado.', 'success');
    };
    const saveLabel = {
        idle: '',
        saving: 'Salvando...',
        saved: 'Salvo no banco',
        error: 'Erro ao salvar'
    }[saveState];

    return (
        <div className="app-container resumo-bloqueio-page">
            <Sidebar />

            <main className="main-content">
                <div className="page-header resumo-page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-triangle-exclamation"></i> Resumo Diário de Bloqueio</h1>
                        <p>Registro diário de inspeções com bloqueio</p>
                    </div>
                    <div className="header-actions resumo-toolbar">
                        <label className="resumo-toolbar-date">
                            <span>Data</span>
                            <input
                                type="date"
                                className="form-control"
                                value={date}
                                onChange={(event) => handleDateChange(event.target.value)}
                            />
                        </label>
                        <button type="button" className="btn btn-outline" onClick={exportPdf}>
                            <i className="fas fa-file-pdf"></i> Exportar PDF
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary resumo-send-btn"
                            onClick={handleSend}
                            disabled={detectedShifts.length === 0}
                            title="Enviar Relatório"
                            aria-label="Enviar Relatório"
                        >
                            <i className="fas fa-paper-plane"></i>
                        </button>
                        <button type="button" className="btn btn-primary" onClick={addRow}>
                            <i className="fas fa-plus"></i> Nova Linha
                        </button>
                    </div>
                </div>

                <div className="table-card resumo-card">
                    <div className="resumo-card-heading">
                        <div>
                            <h2><i className="fas fa-clipboard-list"></i> Inspeção</h2>
                            <p>Resumo do dia selecionado</p>
                        </div>
                        <div className="resumo-card-meta">
                            {saveLabel && <span className={`resumo-save-state resumo-save-state-${saveState}`}>{saveLabel}</span>}
                            <label className="resumo-card-date">
                                <span>Data</span>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(event) => handleDateChange(event.target.value)}
                                />
                            </label>
                        </div>
                    </div>

                    <div className="resumo-table-wrapper">
                        <table className="resumo-table">
                            <colgroup>
                                <col className="col-turno" />
                                <col className="col-qtd" />
                                <col className="col-produto" />
                                <col className="col-peca" />
                                <col className="col-defeito" />
                                <col className="col-evidencia" />
                                <col className="col-acoes" />
                            </colgroup>
                            <thead>
                                <tr>
                                    <th>Turno</th>
                                    <th>Qtd</th>
                                    <th>Produto</th>
                                    <th>Peça</th>
                                    <th>Defeito</th>
                                    <th>Evidência</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={7} className="resumo-loading-cell">Carregando resumo...</td>
                                    </tr>
                                ) : rows.map((row) => (
                                    <tr key={row.id}>
                                        <td className="resumo-td-turno">
                                            <input
                                                type="text"
                                                className="field-upper"
                                                value={row.turno}
                                                onChange={(event) => updateRow(row.id, 'turno', event.target.value)}
                                                placeholder="A / B / C"
                                                maxLength={1}
                                                aria-label="Turno"
                                            />
                                            <span
                                                className="resumo-shift-dot"
                                                style={{ background: shiftColor(row.turno) }}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="number"
                                                value={row.qtd}
                                                onChange={(event) => updateRow(row.id, 'qtd', event.target.value)}
                                                aria-label="Quantidade"
                                            />
                                        </td>
                                        <td>
                                            <textarea
                                                className="field-upper resumo-textarea"
                                                rows={2}
                                                value={row.produto}
                                                onChange={(event) => handleTextChange(event, row.id, 'produto')}
                                                onFocus={(event) => resizeTextarea(event.target)}
                                                aria-label="Produto"
                                            />
                                        </td>
                                        <td>
                                            <textarea
                                                className="field-upper resumo-textarea"
                                                rows={2}
                                                value={row.peca}
                                                onChange={(event) => handleTextChange(event, row.id, 'peca')}
                                                onFocus={(event) => resizeTextarea(event.target)}
                                                aria-label="Peça"
                                            />
                                        </td>
                                        <td>
                                            <textarea
                                                className="field-upper resumo-textarea"
                                                rows={2}
                                                value={row.defeito}
                                                onChange={(event) => handleTextChange(event, row.id, 'defeito')}
                                                onFocus={(event) => resizeTextarea(event.target)}
                                                aria-label="Defeito"
                                            />
                                        </td>
                                        <td>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                capture="environment"
                                                id={`photo-input-${row.id}`}
                                                className="resumo-photo-input"
                                                onChange={(event) => handlePhotoSelect(event, row.id)}
                                            />
                                            {row.evidenciaPreview ? (
                                                <div className="resumo-photo-preview">
                                                    <img src={row.evidenciaPreview} alt="Evidência" />
                                                    <button
                                                        type="button"
                                                        className="resumo-photo-remove"
                                                        onClick={() => removePhoto(row.id)}
                                                        aria-label="Remover evidência"
                                                    >
                                                        <i className="fas fa-times"></i>
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="resumo-photo-empty">
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-outline resumo-photo-btn"
                                                        onClick={() => openPhotoOptions(row.id)}
                                                    >
                                                        <i className="fas fa-camera"></i> Anexar / Foto
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td className="resumo-actions-cell">
                                            <button
                                                type="button"
                                                className="icon-button resumo-delete-button"
                                                onClick={() => removeRow(row.id)}
                                                disabled={rows.length === 1}
                                                aria-label="Excluir linha"
                                            >
                                                <i className="fas fa-trash"></i>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                <tr>
                                    <td colSpan={7} className="add-row-cell">
                                        <button type="button" className="btn btn-ghost btn-sm" onClick={addRow} disabled={loading}>
                                            <i className="fas fa-plus"></i> Adicionar linha
                                        </button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                {sendFeedback && (
                    <div className={`resumo-toast resumo-toast-${sendFeedback.type}`} role="status">
                        {sendFeedback.message}
                    </div>
                )}
            </main>
        </div>
    );
}