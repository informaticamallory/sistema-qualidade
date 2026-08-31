import { useCallback, useEffect, useMemo, useState } from 'react';
import ExcelJS from 'exceljs';
import Sidebar from '../../components/Sidebar/Sidebar';
import {
    cartoesAPI,
    fichasAPI,
    injecaoAPI,
    recebimentoAPI,
    registrosAPI,
    relatorioRecebimentoAPI
} from '../../services/api';
import { formatarTurno, normalizarTurno } from '../../utils/turnos';
import { formatDateBR, formatLocalDateISO, parseLocalDate, todayISO } from '../../utils/date';
import './Relatorios.css';

const hojeISO = todayISO;

const mesPassadoISO = () => {
    const data = parseLocalDate(todayISO()) || new Date();
    data.setMonth(data.getMonth() - 1);
    return formatLocalDateISO(data);
};

const normalizarStatus = (status) => (status || 'pendente').toLowerCase();

const formatarQuantidade = (valor) => new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 0
}).format(Number(valor) || 0);

const buscarTodasPaginas = async (getAll, params = {}) => {
    const limite = 100;
    const registros = [];
    const ids = new Set();

    for (let pagina = 1; pagina <= 100; pagina += 1) {
        const response = await getAll({ ...params, page: pagina, limit: limite });
        const itens = response?.data?.success ? response.data.data || [] : [];

        itens.forEach((item) => {
            const chave = item?.id ?? `${pagina}-${registros.length}`;
            if (!ids.has(chave)) {
                ids.add(chave);
                registros.push(item);
            }
        });

        if (itens.length < limite) break;
    }

    return registros;
};

export default function Relatorios() {
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [activeTab, setActiveTab] = useState('registros');
    const [dados, setDados] = useState([]);
    const [fontes, setFontes] = useState({
        montagem: [],
        injecao: [],
        recebimento: [],
        entradaMp: [],
        cartoes: [],
        fichasNC: []
    });

    const [filtros, setFiltros] = useState({
        dataInicio: mesPassadoISO(),
        dataFim: hojeISO(),
        status: '',
        tipo: '',
        local: '',
        turno: '',
        prioridade: '',
        inspetor: ''
    });

    const [estatisticas, setEstatisticas] = useState({
        total: 0,
        aprovados: 0,
        reprovados: 0,
        pendentes: 0,
        taxaAprovacao: 0,
        quantidadeInspecionada: 0,
        quantidadeNC: 0
    });

    const formatarData = (dataString) => formatDateBR(dataString);

    const getStatusClass = (status) => {
        const classes = {
            aprovado: 'badge-success',
            pendente: 'badge-warning',
            reprovado: 'badge-danger'
        };
        return classes[normalizarStatus(status)] || 'badge-warning';
    };

    const normalizarRegistros = useCallback((base = fontes) => {
        const montagem = base.montagem.map((item) => ({
            id: item.id,
            key: `montagem-${item.id}`,
            tipo: 'montagem',
            tipoLabel: 'Montagem',
            data: item.data_inspecao,
            codigo: item.cod_sap,
            descricao: item.modelo || item.descricao_sap,
            local: item.linha_montagem || item.linha || 'Sem Linha',
            turno: normalizarTurno(item.turno),
            qtdTotal: item.qtd_total || 0,
            qtdInspecionada: item.qtd_inspecionada || 0,
            qtdNC: item.qtd_nc || 0,
            status: normalizarStatus(item.status),
            inspetor: item.inspetor,
            prioridade: item.prioridade || '',
            documento: item.documento || '',
            defeito: item.defeito || ''
        }));

        const injecao = base.injecao.map((item) => ({
            id: item.id,
            key: `injecao-${item.id}`,
            tipo: 'injecao',
            tipoLabel: 'Injeção',
            data: item.data,
            codigo: item.cod,
            descricao: item.peca,
            local: item.maquina || 'Sem Máquina',
            turno: normalizarTurno(item.turno_injecao),
            qtdTotal: item.qtde_lote || 0,
            qtdInspecionada: item.amostra_insp || 0,
            qtdNC: item.amostra_nc || 0,
            status: normalizarStatus(item.status),
            inspetor: item.inspetor,
            prioridade: '',
            documento: item.molde || '',
            defeito: item.defeito || ''
        }));

        const recebimento = base.recebimento.map((item) => ({
            id: item.id,
            key: `recebimento-${item.id}`,
            tipo: 'recebimento',
            tipoLabel: 'Ficha Recebimento',
            data: item.data_inspecao,
            codigo: item.codigo,
            descricao: item.componente || item.aplicacao,
            local: item.setor || item.fornecedor || 'Recebimento',
            turno: '',
            qtdTotal: item.lotes?.reduce((acc, lote) => acc + (parseInt(lote.quant_total, 10) || 0), 0) || 0,
            qtdInspecionada: item.resultados?.length || 0,
            qtdNC: 0,
            status: normalizarStatus(item.status),
            inspetor: item.inspetor,
            prioridade: '',
            documento: item.revisao_desenho || '',
            defeito: ''
        }));

        const entradaMp = base.entradaMp.map((item) => ({
            id: item.id,
            key: `entrada-mp-${item.id}`,
            tipo: 'entrada-mp',
            tipoLabel: 'Entrada MP',
            data: item.data_inspecao || item.data_entrada,
            codigo: item.cod_sap,
            descricao: item.descricao_sap,
            local: item.fornecedor || 'Entrada MP',
            turno: '',
            qtdTotal: item.qtd_total || 0,
            qtdInspecionada: item.qtd_inspecionada || 0,
            qtdNC: item.qtd_nc || 0,
            status: normalizarStatus(item.status_material),
            inspetor: item.inspetor,
            prioridade: '',
            documento: item.documento || '',
            defeito: item.defeito || ''
        }));

        return [...montagem, ...injecao, ...recebimento, ...entradaMp];
    }, [fontes]);

    const normalizarCartoes = useCallback((base = fontes.cartoes) => {
        return base.map((item) => ({
            id: item.id,
            key: `cartao-${item.id}`,
            data: item.created_at,
            codigo: item.codigo_produto,
            produto: item.nome_produto || item.descricao,
            origem: item.origem,
            setor: item.setor,
            turno: normalizarTurno(item.turno),
            qtdConforme: item.qtd_conforme || 0,
            qtdNC: item.qtd_nao_conforme || 0,
            qtdTotal: Number(item.qtd_conforme || 0) + Number(item.qtd_nao_conforme || 0),
            qtdInspecionada: Number(item.qtd_conforme || 0) + Number(item.qtd_nao_conforme || 0),
            status: normalizarStatus(item.status),
            documento: item.documento_reprovacao || '',
            responsavel: item.responsavel
        }));
    }, [fontes.cartoes]);

    const normalizarFichasNC = useCallback((base = fontes) => {
        return (base.fichasNC || [])
            .filter((ficha) => ficha.ficha_nc_id)
            .map((ficha) => ({
                id: ficha.ficha_nc_id,
                key: `ficha-${ficha.ficha_nc_id}`,
                tipo: 'ficha-nc',
                tipoLabel: 'Ficha NC',
                origemNC: ficha.numero_fnc || 'Ficha NC',
                data: ficha.data_fnc || ficha.data_inspecao,
                codigo: ficha.codigo || ficha.cod_sap,
                descricao: ficha.produto || ficha.modelo,
                local: ficha.linha_montagem || ficha.linha || ficha.origemNC || '',
                turno: ficha.turno || '',
                qtdTotal: ficha.quantidade || ficha.qtd_total || 0,
                qtdInspecionada: ficha.qtd_inspecionadas || ficha.qtd_inspecionada || 0,
                qtdNC: ficha.qtd_nao_conforme || ficha.qtd_nc || 0,
                status: normalizarStatus(ficha.status || 'aberta'),
                responsavel: ficha.responsavel || ficha.responsavel_acao || ficha.inspetor || '',
                documento: ficha.numero_fnc || '',
                defeito: ficha.descricao_nc || ficha.defeito || ''
            }));
    }, [fontes]);

    const baseAtual = useMemo(() => {
        if (activeTab === 'cartoes') return normalizarCartoes();
        if (activeTab === 'fichas') return normalizarFichasNC();
        return normalizarRegistros();
    }, [activeTab, normalizarCartoes, normalizarFichasNC, normalizarRegistros]);

    const aplicarFiltros = useCallback((data) => {
        const inicio = filtros.dataInicio ? parseLocalDate(filtros.dataInicio) : null;
        const fim = filtros.dataFim ? parseLocalDate(filtros.dataFim) : null;

        return data.filter((item) => {
            const dataItem = item.data ? parseLocalDate(item.data) : null;
            const dentroInicio = !inicio || (dataItem && dataItem >= inicio);
            const dentroFim = !fim || (dataItem && dataItem <= fim);
            const mesmoStatus = !filtros.status || item.status === filtros.status;
            const mesmoTipo = activeTab === 'cartoes' || !filtros.tipo || item.tipo === filtros.tipo;
            const mesmoLocal = !filtros.local || item.local === filtros.local || item.setor === filtros.local;
            const mesmoTurno = !filtros.turno || item.turno === filtros.turno;
            const mesmaPrioridade = activeTab !== 'registros' || !filtros.prioridade || item.prioridade === filtros.prioridade;
            const mesmoInspetor = !filtros.inspetor || (item.inspetor || item.responsavel || '').toLowerCase().includes(filtros.inspetor.toLowerCase());

            return dentroInicio && dentroFim && mesmoStatus && mesmoTipo && mesmoLocal && mesmoTurno && mesmaPrioridade && mesmoInspetor;
        });
    }, [activeTab, filtros]);

    const calcularEstatisticas = (data) => {
        const total = data.length;
        const aprovados = data.filter((d) => d.status === 'aprovado').length;
        const reprovados = data.filter((d) => d.status === 'reprovado').length;
        const pendentes = data.filter((d) => d.status === 'pendente').length;
        const taxaAprovacao = total > 0 ? ((aprovados / total) * 100).toFixed(1) : 0;
        const quantidadeInspecionada = data.reduce((totalAtual, item) => totalAtual + (Number(item.qtdInspecionada) || 0), 0);
        const quantidadeNC = data.reduce((totalAtual, item) => totalAtual + (Number(item.qtdNC) || 0), 0);

        setEstatisticas({
            total, aprovados, reprovados, pendentes, taxaAprovacao,
            quantidadeInspecionada, quantidadeNC
        });
    };

    const buscarDados = useCallback(async () => {
        try {
            setLoading(true);
            const [montagem, injecao, recebimento, entradaMp, cartoes, fichasNC] = await Promise.allSettled([
                buscarTodasPaginas(registrosAPI.getAll),
                buscarTodasPaginas(injecaoAPI.getAll),
                buscarTodasPaginas(recebimentoAPI.getAll),
                buscarTodasPaginas(relatorioRecebimentoAPI.getAll),
                buscarTodasPaginas(cartoesAPI.getAll),
                fichasAPI.getAll({ limit: 100 })
            ]);

            const novasFontes = {
                montagem: montagem.status === 'fulfilled' ? montagem.value : [],
                injecao: injecao.status === 'fulfilled' ? injecao.value : [],
                recebimento: recebimento.status === 'fulfilled' ? recebimento.value : [],
                entradaMp: entradaMp.status === 'fulfilled' ? entradaMp.value : [],
                cartoes: cartoes.status === 'fulfilled' ? cartoes.value : [],
                fichasNC: fichasNC.status === 'fulfilled' && fichasNC.value.data.success ? fichasNC.value.data.data || [] : []
            };

            setFontes(novasFontes);
        } catch (error) {
            console.error('Erro ao buscar dados:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        buscarDados();
    }, [buscarDados]);

    useEffect(() => {
        const filtrados = aplicarFiltros(baseAtual);
        setDados(filtrados);
        calcularEstatisticas(filtrados);
    }, [aplicarFiltros, baseAtual]);

    const colunas = useMemo(() => {
        if (activeTab === 'cartoes') {
            return [
                { key: 'data', label: 'Data', render: (item) => formatarData(item.data) },
                { key: 'codigo', label: 'Código SAP', render: (item) => item.codigo || '-' },
                { key: 'produto', label: 'Produto', render: (item) => item.produto || '-' },
                { key: 'origem', label: 'Origem', render: (item) => item.origem || '-' },
                { key: 'setor', label: 'Setor', render: (item) => item.setor || '-' },
                { key: 'turno', label: 'Turno', render: (item) => item.turno || '-' },
                { key: 'qtdConforme', label: 'Qtd Conforme', render: (item) => item.qtdConforme },
                { key: 'qtdNC', label: 'Qtd NC', render: (item) => item.qtdNC },
                { key: 'status', label: 'Status', isStatus: true, render: (item) => String(item.status || '').toUpperCase() },
                { key: 'responsavel', label: 'Responsável', render: (item) => item.responsavel || '-' }
            ];
        }

        if (activeTab === 'fichas') {
            return [
                { key: 'data', label: 'Data', render: (item) => formatarData(item.data) },
                { key: 'origemNC', label: 'Origem', render: (item) => item.origemNC || item.tipoLabel || '-' },
                { key: 'codigo', label: 'Código', render: (item) => item.codigo || '-' },
                { key: 'descricao', label: 'Descrição', render: (item) => item.descricao || '-' },
                { key: 'local', label: 'Linha / Local', render: (item) => item.local || '-' },
                { key: 'qtdNC', label: 'Qtd NC', render: (item) => item.qtdNC || 0 },
                { key: 'defeito', label: 'Defeito', render: (item) => item.defeito || '-' },
                { key: 'documento', label: 'Documento', render: (item) => item.documento || '-' },
                { key: 'status', label: 'Status', isStatus: true, render: (item) => String(item.status || '').toUpperCase() },
                { key: 'responsavel', label: 'Responsável', render: (item) => item.responsavel || item.inspetor || '-' }
            ];
        }

        return [
            { key: 'data', label: 'Data', render: (item) => formatarData(item.data) },
            { key: 'tipoLabel', label: 'Tipo', render: (item) => item.tipoLabel },
            { key: 'codigo', label: 'Código SAP', render: (item) => item.codigo || '-' },
            { key: 'descricao', label: 'Descrição', render: (item) => item.descricao || '-' },
            { key: 'local', label: 'Linha / Local', render: (item) => item.local || '-' },
            { key: 'turno', label: 'Turno', render: (item) => item.turno || '-' },
            { key: 'qtdTotal', label: 'Qtd Total', render: (item) => item.qtdTotal || 0 },
            { key: 'qtdInspecionada', label: 'Qtd Insp.', render: (item) => item.qtdInspecionada || 0 },
            { key: 'qtdNC', label: 'Qtd NC', render: (item) => item.qtdNC || 0 },
            { key: 'status', label: 'Status', isStatus: true, render: (item) => String(item.status || '').toUpperCase() },
            { key: 'inspetor', label: 'Inspetor', render: (item) => item.inspetor || '-' }
        ];
    }, [activeTab]);

    const locaisDisponiveis = useMemo(() => {
        return [...new Set(baseAtual
            .filter((item) => activeTab === 'cartoes' || !filtros.tipo || item.tipo === filtros.tipo)
            .map((item) => item.local || item.setor)
            .filter(Boolean))]
            .sort();
    }, [activeTab, baseAtual, filtros.tipo]);

    const turnosDisponiveis = useMemo(() => {
        return [...new Set(baseAtual
            .filter((item) => !filtros.local || item.local === filtros.local || item.setor === filtros.local)
            .map((item) => item.turno)
            .filter(Boolean))]
            .sort();
    }, [baseAtual, filtros.local]);

    const exportarExcel = async () => {
        try {
            setExporting(true);
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Sistema Mallory';
            workbook.created = new Date();

            const worksheet = workbook.addWorksheet('Relatório', {
                views: [{ state: 'frozen', ySplit: 1 }]
            });
            const larguras = {
                data: 13, tipoLabel: 18, codigo: 17, descricao: 40, local: 25,
                turno: 10, qtdTotal: 15, qtdInspecionada: 17, qtdNC: 12,
                status: 16, inspetor: 24, produto: 36, origem: 20, setor: 20,
                qtdConforme: 16, responsavel: 24, origemNC: 20, defeito: 30,
                documento: 20
            };

            worksheet.columns = colunas.map((coluna) => ({
                header: coluna.label,
                key: coluna.key,
                width: larguras[coluna.key] || 18
            }));

            dados.forEach((item) => {
                const linha = {};
                colunas.forEach((coluna) => {
                    if (coluna.key === 'data') {
                        const match = String(item.data || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
                        linha[coluna.key] = match
                            ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
                            : coluna.render(item);
                    } else {
                        linha[coluna.key] = coluna.render(item);
                    }
                });
                worksheet.addRow(linha);
            });

            const header = worksheet.getRow(1);
            header.height = 28;
            header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF7A00' } };
            header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

            worksheet.autoFilter = {
                from: { row: 1, column: 1 },
                to: { row: worksheet.rowCount, column: colunas.length }
            };
            if (colunas.some(({ key }) => key === 'data')) worksheet.getColumn('data').numFmt = 'dd/mm/yyyy';
            if (colunas.some(({ key }) => key === 'codigo')) worksheet.getColumn('codigo').numFmt = '@';

            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return;
                row.height = 24;
                row.alignment = { vertical: 'middle', wrapText: false };
                row.eachCell((cell) => {
                    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD9E1EA' } } };
                });
            });

            ['turno', 'qtdTotal', 'qtdInspecionada', 'qtdNC', 'qtdConforme', 'status']
                .filter((key) => colunas.some((coluna) => coluna.key === key))
                .forEach((key) => {
                    worksheet.getColumn(key).alignment = { vertical: 'middle', horizontal: 'center' };
                });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `relatorio_${activeTab}_${todayISO()}.xlsx`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Erro ao exportar:', error);
            alert('Erro ao exportar relatório');
        } finally {
            setExporting(false);
        }
    };

    const exportarPDF = () => {
        window.print();
    };

    const limparFiltros = () => {
        setFiltros({
            dataInicio: mesPassadoISO(),
            dataFim: hojeISO(),
            status: '',
            tipo: '',
            local: '',
            turno: '',
            prioridade: '',
            inspetor: ''
        });
    };

    const tabs = [
        { id: 'registros', icon: 'fa-list-check', label: 'Registros de Inspeção' },
        { id: 'cartoes', icon: 'fa-credit-card', label: 'Cartões de Qualidade' },
        { id: 'fichas', icon: 'fa-file-alt', label: 'Fichas NC' }
    ];

    return (
        <div className="app-container relatorios-page">
            <Sidebar />

            <main className="main-content">
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-chart-bar"></i> Relatórios</h1>
                        <p>Gere e exporte relatórios detalhados do sistema</p>
                    </div>
                    <div className="header-actions">
                        <button className="btn btn-success" onClick={exportarExcel} disabled={exporting || dados.length === 0}>
                            <i className={`fas ${exporting ? 'fa-spinner fa-spin' : 'fa-file-excel'}`}></i> Exportar Excel
                        </button>
                        <button className="btn btn-danger" onClick={exportarPDF} disabled={dados.length === 0}>
                            <i className="fas fa-file-pdf"></i> Exportar PDF
                        </button>
                    </div>
                </div>

                <div className="report-tabs-container">
                    <div className="report-tabs">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                className={`report-tab ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <i className={`fas ${tab.icon}`}></i> {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="filters-card">
                    <div className="filters-header">
                        <h3><i className="fas fa-filter"></i> Filtros</h3>
                        <button className="btn-link" onClick={limparFiltros}>
                            <i className="fas fa-eraser"></i> Limpar Filtros
                        </button>
                    </div>
                    <div className="filters-grid">
                        <div className="form-group">
                            <label>Data Início *</label>
                            <input
                                type="date"
                                className="form-control"
                                value={filtros.dataInicio}
                                onChange={(e) => setFiltros({ ...filtros, dataInicio: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Data Fim *</label>
                            <input
                                type="date"
                                className="form-control"
                                value={filtros.dataFim}
                                onChange={(e) => setFiltros({ ...filtros, dataFim: e.target.value })}
                            />
                        </div>
                        <div className="form-group">
                            <label>Status</label>
                            <select
                                className="form-control"
                                value={filtros.status}
                                onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}
                            >
                                <option value="">Todos</option>
                                <option value="aprovado">Aprovado</option>
                                <option value="pendente">Pendente</option>
                                <option value="reprovado">Reprovado</option>
                            </select>
                        </div>
                        {activeTab !== 'cartoes' && (
                            <div className="form-group">
                                <label>Tipo de Inspeção</label>
                                <select
                                    className="form-control"
                                    value={filtros.tipo}
                                    onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value, local: '', turno: '' })}
                                >
                                    <option value="">Todas</option>
                                    <option value="montagem">Montagem</option>
                                    <option value="injecao">Injeção</option>
                                    <option value="recebimento">Ficha Recebimento</option>
                                    <option value="entrada-mp">Entrada MP</option>
                                    {activeTab === 'fichas' && <option value="cartao">Cartão</option>}
                                </select>
                            </div>
                        )}
                        <div className="form-group filter-local">
                            <label>{activeTab === 'cartoes' ? 'Setor' : 'Linha / Máquina / Local'}</label>
                            <select
                                className="form-control"
                                value={filtros.local}
                                onChange={(e) => setFiltros({ ...filtros, local: e.target.value, turno: '' })}
                            >
                                <option value="">Todos</option>
                                {locaisDisponiveis.map((local) => (
                                    <option key={local} value={local}>{local}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Turno</label>
                            <select
                                className="form-control"
                                value={filtros.turno}
                                onChange={(e) => setFiltros({ ...filtros, turno: e.target.value })}
                            >
                                <option value="">Todos</option>
                                {turnosDisponiveis.map((turno) => (
                                    <option key={turno} value={turno}>{formatarTurno(turno)}</option>
                                ))}
                            </select>
                        </div>
                        {activeTab === 'registros' && (
                            <div className="form-group">
                                <label>Prioridade</label>
                                <select
                                    className="form-control"
                                    value={filtros.prioridade}
                                    onChange={(e) => setFiltros({ ...filtros, prioridade: e.target.value })}
                                >
                                    <option value="">Todas</option>
                                    <option value="critico">Crítico</option>
                                    <option value="primario">Primário</option>
                                    <option value="secundario">Secundário</option>
                                </select>
                            </div>
                        )}
                        <div className="form-group filter-search" style={{ display: 'flex', alignItems: 'flex-end', marginBottom: '15px' }}>
                            <button className="btn btn-primary btn-sm" onClick={buscarDados} style={{ width: '100%', minHeight: '42px' }}>
                                <i className="fas fa-search"></i> Buscar
                            </button>
                        </div>
                    </div>
                </div>

                <div className="stats-grid relatorios-stats-grid">
                    <div className="stat-card">
                        <div className="stat-header">
                            <div>
                                <div className="stat-value">{estatisticas.total}</div>
                                <div className="stat-label">Total de Registros</div>
                            </div>
                            <div className="stat-icon primary">
                                <i className="fas fa-clipboard-list"></i>
                            </div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-header">
                            <div>
                                <div className="stat-value">{estatisticas.aprovados}</div>
                                <div className="stat-label">Aprovados</div>
                            </div>
                            <div className="stat-icon success">
                                <i className="fas fa-check-circle"></i>
                            </div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-header">
                            <div>
                                <div className="stat-value">{estatisticas.reprovados}</div>
                                <div className="stat-label">Reprovados</div>
                            </div>
                            <div className="stat-icon danger">
                                <i className="fas fa-times-circle"></i>
                            </div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-header">
                            <div>
                                <div className="stat-value">{estatisticas.taxaAprovacao}%</div>
                                <div className="stat-label">Taxa de Aprovação</div>
                            </div>
                            <div className="stat-icon warning">
                                <i className="fas fa-percentage"></i>
                            </div>
                        </div>
                    </div>
                    <div className="stat-card stat-card-volume">
                        <div className="stat-header">
                            <div className="stat-volume-copy">
                                <div className="stat-volume-metrics">
                                    <div>
                                        <strong>{formatarQuantidade(estatisticas.quantidadeInspecionada)}</strong>
                                        <span>Unidades inspecionadas</span>
                                    </div>
                                    <div>
                                        <strong className="danger">{formatarQuantidade(estatisticas.quantidadeNC)}</strong>
                                        <span>Peças NC</span>
                                    </div>
                                </div>
                            </div>
                            <div className="stat-icon info">
                                <i className="fas fa-boxes-stacked"></i>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="table-card printable">
                    <div className="table-header">
                        <h3 className="table-title">
                            <i className="fas fa-table"></i> Resultados ({dados.length} registros)
                        </h3>
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    {colunas.map((coluna) => (
                                        <th key={coluna.key} style={coluna.isStatus ? { textAlign: 'center' } : undefined}>
                                            {coluna.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={colunas.length}>
                                            <div className="loading">
                                                <div className="loading-spinner"></div>
                                                <p>Carregando...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : dados.length === 0 ? (
                                    <tr>
                                        <td colSpan={colunas.length} className="text-center">
                                            <i className="fas fa-inbox" style={{ fontSize: '2rem', color: 'var(--text-subtle)', marginBottom: '1rem', display: 'block' }}></i>
                                            <p>Nenhum registro encontrado para os filtros selecionados</p>
                                        </td>
                                    </tr>
                                ) : (
                                    dados.map((item, index) => (
                                        <tr key={item.key || item.id || index}>
                                            {colunas.map((coluna) => (
                                                <td key={coluna.key} style={coluna.isStatus ? { textAlign: 'center' } : undefined}>
                                                    {coluna.isStatus ? (
                                                        <span className={`badge ${getStatusClass(coluna.render(item))}`}>
                                                            {coluna.render(item)}
                                                        </span>
                                                    ) : (
                                                        coluna.render(item)
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
