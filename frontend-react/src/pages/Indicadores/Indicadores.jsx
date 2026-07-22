import { useCallback, useEffect, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Filler } from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';
import Sidebar from '../../components/Sidebar/Sidebar';
import { injecaoAPI, recebimentoAPI, registrosAPI, relatorioRecebimentoAPI } from '../../services/api';
import { useAuth } from '../../context/auth-context';
import { useTheme } from '../../context/theme-context';
import { formatarTurno, normalizarTurno } from '../../utils/turnos';
import './Indicadores.css';

// Registrar componentes do Chart.js
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Filler);

export default function Indicadores() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // Remontar gráficos quando o tema muda (pega novas cores padrão do Chart.js)
    const { theme } = useTheme();
    const { can } = useAuth();
    const [registros, setRegistros] = useState([]);
    const [injecoes, setInjecoes] = useState([]);
    const [fichasRecebimento, setFichasRecebimento] = useState([]);
    const [entradasMateriaPrima, setEntradasMateriaPrima] = useState([]);

    // Filtros
    const [filtros, setFiltros] = useState({
        periodo: '30', // dias
        tipo: '',
        local: '',
        turno: ''
    });

    // Indicadores calculados
    const [indicadores, setIndicadores] = useState({
        taxaAprovacao: 0,
        taxaReprovacao: 0,
        totalInspecoes: 0,
        totalNC: 0,
        mediaDiaria: 0,
        tendencia: 'estavel'
    });

    const normalizarInspecoes = useCallback(() => {
        const montagem = registros.map((reg) => ({
            tipo: 'montagem',
            tipoLabel: 'Montagem',
            data: reg.data_inspecao,
            status: reg.status,
            qtd_nc: reg.qtd_nc || 0,
            local: reg.linha_montagem || reg.linha || 'Sem Linha',
            turno: normalizarTurno(reg.turno),
            defeito: reg.defeito
        }));

        const injecao = injecoes.map((reg) => ({
            tipo: 'injecao',
            tipoLabel: 'Injeção',
            data: reg.data,
            status: reg.status,
            qtd_nc: reg.amostra_nc || 0,
            local: reg.maquina || 'Sem Máquina',
            turno: normalizarTurno(reg.turno_injecao),
            defeito: reg.defeito
        }));

        const recebimento = fichasRecebimento.map((reg) => ({
            tipo: 'recebimento',
            tipoLabel: 'Ficha Recebimento',
            data: reg.data_inspecao,
            status: reg.status,
            qtd_nc: 0,
            local: reg.setor || reg.fornecedor || 'Recebimento',
            turno: '',
            defeito: ''
        }));

        const entradaMp = entradasMateriaPrima.map((reg) => ({
            tipo: 'entrada-mp',
            tipoLabel: 'Entrada MP',
            data: reg.data_inspecao,
            status: reg.status_material,
            qtd_nc: reg.qtd_nc || 0,
            local: reg.fornecedor || 'Entrada MP',
            turno: '',
            defeito: reg.defeito
        }));

        return [...montagem, ...injecao, ...recebimento, ...entradaMp];
    }, [registros, injecoes, fichasRecebimento, entradasMateriaPrima]);

    const filtrarIndicadores = useCallback((data) => {
        const hoje = new Date();
        const diasAtras = new Date();
        diasAtras.setDate(hoje.getDate() - parseInt(filtros.periodo));

        let dadosFiltrados = data.filter(d => {
            if (!d.data) return false;
            const dataReg = new Date(d.data);
            return dataReg >= diasAtras && dataReg <= hoje;
        });

        if (filtros.tipo) {
            dadosFiltrados = dadosFiltrados.filter(d => d.tipo === filtros.tipo);
        }

        if (filtros.local) {
            dadosFiltrados = dadosFiltrados.filter(d => d.local === filtros.local);
        }

        if (filtros.turno) {
            dadosFiltrados = dadosFiltrados.filter(d => d.turno === filtros.turno);
        }

        return dadosFiltrados;
    }, [filtros]);

    const calcularIndicadores = useCallback((data) => {
        const hoje = new Date();
        const diasAtras = new Date();
        diasAtras.setDate(hoje.getDate() - parseInt(filtros.periodo));
        const dadosFiltrados = filtrarIndicadores(data);
        const total = dadosFiltrados.length;
        const aprovados = dadosFiltrados.filter(d => d.status?.toLowerCase() === 'aprovado').length;
        const reprovados = dadosFiltrados.filter(d => d.status?.toLowerCase() === 'reprovado').length;
        const totalNC = dadosFiltrados.reduce((acc, d) => acc + (d.qtd_nc || 0), 0);

        const taxaAprovacao = total > 0 ? ((aprovados / total) * 100).toFixed(1) : 0;
        const taxaReprovacao = total > 0 ? ((reprovados / total) * 100).toFixed(1) : 0;
        const mediaDiaria = (total / parseInt(filtros.periodo)).toFixed(1);

        // Calcular tendência (comparar com período anterior)
        const periodoAnteriorInicio = new Date(diasAtras);
        periodoAnteriorInicio.setDate(periodoAnteriorInicio.getDate() - parseInt(filtros.periodo));

        const dadosPeriodoAnterior = data.filter(d => {
            if (!d.data) return false;
            const dataReg = new Date(d.data);
            const dentroPeriodo = dataReg >= periodoAnteriorInicio && dataReg < diasAtras;
            const mesmoTipo = !filtros.tipo || d.tipo === filtros.tipo;
            const mesmoLocal = !filtros.local || d.local === filtros.local;
            const mesmoTurno = !filtros.turno || d.turno === filtros.turno;
            return dentroPeriodo && mesmoTipo && mesmoLocal && mesmoTurno;
        }).length;

        let tendencia = 'estavel';
        if (total > dadosPeriodoAnterior * 1.1) tendencia = 'crescimento';
        else if (total < dadosPeriodoAnterior * 0.9) tendencia = 'queda';

        setIndicadores({
            taxaAprovacao,
            taxaReprovacao,
            totalInspecoes: total,
            totalNC,
            mediaDiaria,
            tendencia
        });
    }, [filtrarIndicadores, filtros]);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);

            const emptyResponse = { data: { success: true, data: [] } };
            const canRegistros = can('registros', 'visualizar');
            const canInjecao = can('injecao', 'visualizar');

            const [registrosResult, injecoesResult, fichasResult, entradasResult] = await Promise.allSettled([
                canRegistros ? registrosAPI.getAll({}) : Promise.resolve(emptyResponse),
                canInjecao ? injecaoAPI.getAll({}) : Promise.resolve(emptyResponse),
                canRegistros ? recebimentoAPI.getAll({}) : Promise.resolve(emptyResponse),
                canRegistros ? relatorioRecebimentoAPI.getAll({}) : Promise.resolve(emptyResponse)
            ]);

            const registrosRes = registrosResult.status === 'fulfilled' ? registrosResult.value : null;
            const injecoesRes = injecoesResult.status === 'fulfilled' ? injecoesResult.value : null;
            const fichasRes = fichasResult.status === 'fulfilled' ? fichasResult.value : null;
            const entradasRes = entradasResult.status === 'fulfilled' ? entradasResult.value : null;

            if (registrosRes?.data.success) {
                const data = registrosRes.data.data || [];
                setRegistros(data);
            }

            if (injecoesRes?.data.success) {
                setInjecoes(injecoesRes.data.data || []);
            }

            if (fichasRes?.data.success) {
                setFichasRecebimento(fichasRes.data.data || []);
            }

            if (entradasRes?.data.success) {
                setEntradasMateriaPrima(entradasRes.data.data || []);
            }

            const failed = [registrosResult, injecoesResult, fichasResult, entradasResult].some((result) => result.status === 'rejected');
            setError(failed ? 'Alguns indicadores não puderam ser carregados.' : null);
        } catch (err) {
            setError(err.response?.status === 429
                ? 'Muitas requisições ao servidor. Aguarde alguns instantes e tente novamente.'
                : 'Não foi possível carregar os indicadores.');
        } finally {
            setLoading(false);
        }
    }, [can]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        calcularIndicadores(normalizarInspecoes());
    }, [calcularIndicadores, normalizarInspecoes]);

    const token = (name) =>
        getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    const tooltipStyle = {
        backgroundColor: 'rgba(17, 21, 28, 0.92)',
        titleColor: '#fff',
        bodyColor: '#cbd5e1',
        padding: 12,
        cornerRadius: 10,
        boxPadding: 6,
        displayColors: true,
        usePointStyle: true
    };

    const getPercentageCallback = (mode = 'pie') => ({
        label: function (context) {
            let label = context.dataset.label || '';
            if (label && mode !== 'pie') {
                label += ': ';
            } else if (mode === 'pie') {
                label = context.label + ': ';
            }

            const value = context.parsed.y !== undefined ? context.parsed.y : context.parsed;
            label += value;

            let total = 0;
            if (mode === 'pie') {
                context.chart.data.datasets[0].data.forEach(dataPoint => {
                    total += dataPoint;
                });
            } else if (mode === 'stack') {
                context.chart.data.datasets.forEach(dataset => {
                    total += dataset.data[context.dataIndex];
                });
            } else if (mode === 'turno') {
                total = context.chart.data.datasets[0].data[context.dataIndex];
            }

            if (total > 0) {
                const percentage = ((value / total) * 100).toFixed(1);
                label += ` (${percentage}%)`;
            }

            return label;
        }
    });

    const filtrarPorPeriodo = (data, campoData) => {
        const hoje = new Date();
        const diasAtras = new Date();
        diasAtras.setDate(hoje.getDate() - parseInt(filtros.periodo));

        return data.filter((item) => {
            const valorData = item[campoData];
            if (!valorData) return false;
            const dataReg = new Date(valorData);
            return dataReg >= diasAtras && dataReg <= hoje;
        });
    };

    const contarStatus = (data, campoStatus = 'status') => {
        return data.reduce((acc, item) => {
            const status = item[campoStatus]?.toLowerCase() || 'pendente';
            acc[status] = (acc[status] || 0) + 1;
            return acc;
        }, {});
    };

    const getMontagemFiltrada = () => {
        if (filtros.tipo && filtros.tipo !== 'montagem') return [];

        return filtrarPorPeriodo(registros, 'data_inspecao').filter((reg) => {
            const local = reg.linha_montagem || reg.linha || 'Sem Linha';
            const mesmoLocal = !filtros.local || local === filtros.local;
            const mesmoTurno = !filtros.turno || normalizarTurno(reg.turno) === filtros.turno;
            return mesmoLocal && mesmoTurno;
        });
    };

    const getInjecoesFiltradas = () => {
        if (filtros.tipo && filtros.tipo !== 'injecao') return [];

        return filtrarPorPeriodo(injecoes, 'data').filter((reg) => {
            const local = reg.maquina || 'Sem Máquina';
            const mesmoLocal = !filtros.local || local === filtros.local;
            const mesmoTurno = !filtros.turno || normalizarTurno(reg.turno_injecao) === filtros.turno;
            return mesmoLocal && mesmoTurno;
        });
    };

    const getFichasRecebimentoFiltradas = () => {
        if (filtros.tipo && filtros.tipo !== 'recebimento') return [];

        return filtrarPorPeriodo(fichasRecebimento, 'data_inspecao').filter((reg) => {
            const local = reg.setor || reg.fornecedor || 'Recebimento';
            return !filtros.local || local === filtros.local;
        });
    };

    const getEntradasMateriaPrimaFiltradas = () => {
        if (filtros.tipo && filtros.tipo !== 'entrada-mp') return [];

        return filtrarPorPeriodo(entradasMateriaPrima, 'data_inspecao').filter((reg) => {
            const local = reg.fornecedor || 'Entrada MP';
            return !filtros.local || local === filtros.local;
        });
    };

    const getLocaisDisponiveis = () => {
        const base = normalizarInspecoes().filter((item) => !filtros.tipo || item.tipo === filtros.tipo);
        return [...new Set(base.map((item) => item.local).filter(Boolean))].sort();
    };

    const getTurnosDisponiveis = () => {
        const base = normalizarInspecoes().filter((item) => {
            const mesmoTipo = !filtros.tipo || item.tipo === filtros.tipo;
            const mesmoLocal = !filtros.local || item.local === filtros.local;
            return mesmoTipo && mesmoLocal;
        });
        return [...new Set(base.map((item) => item.turno).filter(Boolean))].sort();
    };

    // Dados para gráfico de evolução mensal
    const getEvolucaoData = () => {
        const dadosIndicadores = filtrarIndicadores(normalizarInspecoes());
        const hoje = new Date();
        const labels = [];
        const aprovados = [];
        const reprovados = [];
        const pendentes = [];

        for (let i = parseInt(filtros.periodo) - 1; i >= 0; i--) {
            const dia = new Date(hoje);
            dia.setDate(dia.getDate() - i);
            const diaStr = dia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            labels.push(diaStr);

            const registrosDia = dadosIndicadores.filter(r => {
                const dataReg = new Date(r.data);
                return dataReg.toDateString() === dia.toDateString();
            });

            aprovados.push(registrosDia.filter(r => r.status?.toLowerCase() === 'aprovado').length);
            reprovados.push(registrosDia.filter(r => r.status?.toLowerCase() === 'reprovado').length);
            pendentes.push(registrosDia.filter(r => r.status?.toLowerCase() === 'pendente').length);
        }

        // Agrupar por semana se período > 14 dias
        if (parseInt(filtros.periodo) > 14) {
            const semanas = Math.ceil(parseInt(filtros.periodo) / 7);
            const labelsSemanais = [];
            const aprovadosSemanais = [];
            const reprovadosSemanais = [];

            for (let i = 0; i < semanas; i++) {
                labelsSemanais.push(`Sem ${i + 1}`);
                const inicio = i * 7;
                const fim = Math.min((i + 1) * 7, aprovados.length);
                aprovadosSemanais.push(aprovados.slice(inicio, fim).reduce((a, b) => a + b, 0));
                reprovadosSemanais.push(reprovados.slice(inicio, fim).reduce((a, b) => a + b, 0));
            }

            return {
                labels: labelsSemanais,
                datasets: [
                    {
                        label: 'Aprovados',
                        data: aprovadosSemanais,
                        borderColor: '#27ae60',
                        backgroundColor: 'rgba(39, 174, 96, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Reprovados',
                        data: reprovadosSemanais,
                        borderColor: '#e74c3c',
                        backgroundColor: 'rgba(231, 76, 60, 0.1)',
                        fill: true,
                        tension: 0.4
                    }
                ]
            };
        }

        return {
            labels,
            datasets: [
                {
                    label: 'Aprovados',
                    data: aprovados,
                    borderColor: '#27ae60',
                    backgroundColor: 'rgba(39, 174, 96, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: 'Reprovados',
                    data: reprovados,
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        };
    };

    // Dados para gráfico por linha
    const getLinhasData = () => {
        const linhasCount = {};
        getMontagemFiltrada().forEach(reg => {
            const linha = reg.linha_montagem || reg.linha || 'Sem Linha';
            if (!linhasCount[linha]) {
                linhasCount[linha] = { aprovados: 0, reprovados: 0, pendentes: 0 };
            }
            const status = reg.status?.toLowerCase() || 'pendente';
            linhasCount[linha][status === 'aprovado' ? 'aprovados' : status === 'reprovado' ? 'reprovados' : 'pendentes']++;
        });

        const labels = Object.keys(linhasCount).sort();
        const aprovados = labels.map(l => linhasCount[l].aprovados);
        const reprovados = labels.map(l => linhasCount[l].reprovados);

        return {
            labels,
            datasets: [
                {
                    label: 'Aprovados',
                    data: aprovados,
                    backgroundColor: `${token('--success')}cc`,
                    hoverBackgroundColor: token('--success'),
                    borderWidth: 0,
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 46
                },
                {
                    label: 'Reprovados',
                    data: reprovados,
                    backgroundColor: `${token('--danger')}cc`,
                    hoverBackgroundColor: token('--danger'),
                    borderWidth: 0,
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 46
                }
            ]
        };
    };

    // Dados para gráfico de defeitos
    const getDefeitosData = () => {
        const defeitosCount = {};
        filtrarIndicadores(normalizarInspecoes()).filter(r => r.defeito).forEach(reg => {
            const defeito = reg.defeito;
            defeitosCount[defeito] = (defeitosCount[defeito] || 0) + 1;
        });

        const sorted = Object.entries(defeitosCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        return {
            labels: sorted.map(d => d[0].length > 20 ? d[0].substring(0, 20) + '...' : d[0]),
            datasets: [{
                data: sorted.map(d => d[1]),
                backgroundColor: [
                    token('--danger'),
                    token('--warning'),
                    token('--info'),
                    token('--primary'),
                    token('--success')
                ],
                borderColor: token('--surface'),
                borderWidth: 3,
                hoverOffset: 10,
                hoverBorderColor: token('--surface')
            }]
        };
    };

    // Dados para gráfico por turno
    const getTurnoData = () => {
        const turnoCount = { A: { total: 0, nc: 0 }, B: { total: 0, nc: 0 }, C: { total: 0, nc: 0 } };

        filtrarIndicadores(normalizarInspecoes()).forEach(reg => {
            const turno = reg.turno;
            if (turnoCount[turno]) {
                turnoCount[turno].total++;
                turnoCount[turno].nc += reg.qtd_nc || 0;
            }
        });

        return {
            labels: ['Turno A', 'Turno B', 'Turno C'],
            datasets: [
                {
                    label: 'Total Inspeções',
                    data: [turnoCount.A.total, turnoCount.B.total, turnoCount.C.total],
                    backgroundColor: `${token('--warning')}cc`,
                    hoverBackgroundColor: token('--warning'),
                    borderWidth: 0,
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 46
                },
                {
                    label: 'Não Conformidades',
                    data: [turnoCount.A.nc, turnoCount.B.nc, turnoCount.C.nc],
                    backgroundColor: `${token('--danger')}cc`,
                    hoverBackgroundColor: token('--danger'),
                    borderWidth: 0,
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 46
                }
            ]
        };
    };

    const getInjecaoMaquinaData = () => {
        const maquinasCount = {};
        getInjecoesFiltradas().forEach((reg) => {
            const maquina = reg.maquina || 'Sem Máquina';
            if (!maquinasCount[maquina]) {
                maquinasCount[maquina] = { aprovados: 0, reprovados: 0, pendentes: 0 };
            }
            const status = reg.status?.toLowerCase() || 'pendente';
            maquinasCount[maquina][status === 'aprovado' ? 'aprovados' : status === 'reprovado' ? 'reprovados' : 'pendentes']++;
        });

        const labels = Object.keys(maquinasCount).sort();

        return {
            labels,
            datasets: [
                {
                    label: 'Aprovados',
                    data: labels.map((maquina) => maquinasCount[maquina].aprovados),
                    backgroundColor: `${token('--success')}cc`,
                    hoverBackgroundColor: token('--success'),
                    borderWidth: 0,
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 46
                },
                {
                    label: 'Reprovados',
                    data: labels.map((maquina) => maquinasCount[maquina].reprovados),
                    backgroundColor: `${token('--danger')}cc`,
                    hoverBackgroundColor: token('--danger'),
                    borderWidth: 0,
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 46
                },
                {
                    label: 'Pendentes',
                    data: labels.map((maquina) => maquinasCount[maquina].pendentes),
                    backgroundColor: `${token('--warning')}cc`,
                    hoverBackgroundColor: token('--warning'),
                    borderWidth: 0,
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 46
                }
            ]
        };
    };

    const getInjecaoStatusData = () => {
        const statusCount = contarStatus(getInjecoesFiltradas());

        return {
            labels: ['Aprovado', 'Pendente', 'Reprovado'],
            datasets: [{
                data: [
                    statusCount.aprovado || 0,
                    statusCount.pendente || 0,
                    statusCount.reprovado || 0
                ],
                backgroundColor: [
                    token('--success'),
                    token('--warning'),
                    token('--danger')
                ],
                borderColor: token('--surface'),
                borderWidth: 3,
                hoverOffset: 10,
                hoverBorderColor: token('--surface')
            }]
        };
    };

    const getOutrasInspecoesData = () => {
        const fichas = contarStatus(getFichasRecebimentoFiltradas());
        const entradas = contarStatus(getEntradasMateriaPrimaFiltradas(), 'status_material');

        return {
            labels: ['Ficha Recebimento', 'Entrada MP'],
            datasets: [
                {
                    label: 'Aprovadas',
                    data: [fichas.aprovado || 0, entradas.aprovado || 0],
                    backgroundColor: `${token('--success')}cc`,
                    hoverBackgroundColor: token('--success'),
                    borderWidth: 0,
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 46
                },
                {
                    label: 'Reprovadas',
                    data: [fichas.reprovado || 0, entradas.reprovado || 0],
                    backgroundColor: `${token('--danger')}cc`,
                    hoverBackgroundColor: token('--danger'),
                    borderWidth: 0,
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 46
                },
                {
                    label: 'Pendentes',
                    data: [fichas.pendente || 0, entradas.pendente || 0],
                    backgroundColor: `${token('--warning')}cc`,
                    hoverBackgroundColor: token('--warning'),
                    borderWidth: 0,
                    borderRadius: 8,
                    borderSkipped: false,
                    maxBarThickness: 46
                }
            ]
        };
    };

    const getTendenciaIcon = () => {
        switch (indicadores.tendencia) {
            case 'crescimento':
                return <><i className="fas fa-arrow-up"></i> Crescimento</>;
            case 'queda':
                return <><i className="fas fa-arrow-down"></i> Queda</>;
            default:
                return <><i className="fas fa-minus"></i> Estável</>;
        }
    };

    const getTendenciaClass = () => {
        switch (indicadores.tendencia) {
            case 'crescimento':
                return 'tendencia-up';
            case 'queda':
                return 'tendencia-down';
            default:
                return 'tendencia-stable';
        }
    };

    return (
        <div className="app-container">
            <Sidebar />

            <main className="main-content">
                <div className="page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-chart-line"></i> Indicadores de Qualidade</h1>
                        <p>Métricas e análises de desempenho do controle de qualidade</p>
                    </div>
                    <div className="header-actions">
                        <button className="btn btn-success" onClick={() => window.print()}>
                            <i className="fas fa-file-pdf"></i> Exportar PDF
                        </button>
                    </div>
                </div>

                {/* Aviso de erro com retry manual */}
                {error && (
                    <div className="page-alert">
                        <i className="fas fa-exclamation-triangle"></i>
                        <span>{error}</span>
                        <button className="btn btn-outline btn-sm" onClick={loadData}>
                            <i className="fas fa-rotate-right"></i> Tentar novamente
                        </button>
                    </div>
                )}

                {/* Filtros */}
                <div className="filters-card">
                    <div className="filters-header">
                        <h3><i className="fas fa-filter"></i> Filtros</h3>
                    </div>
                    <div className="filters-grid">
                        <div className="form-group">
                            <label>Período</label>
                            <select
                                className="form-control"
                                value={filtros.periodo}
                                onChange={(e) => setFiltros({ ...filtros, periodo: e.target.value })}
                            >
                                <option value="7">Últimos 7 dias</option>
                                <option value="15">Últimos 15 dias</option>
                                <option value="30">Últimos 30 dias</option>
                                <option value="60">Últimos 60 dias</option>
                                <option value="90">Últimos 90 dias</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Tipo de Inspeção</label>
                            <select
                                className="form-control"
                                value={filtros.tipo}
                                onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value, local: '', turno: '' })}
                            >
                                <option value="">Todas as Inspeções</option>
                                {can('registros', 'visualizar') && <option value="montagem">Montagem</option>}
                                {can('injecao', 'visualizar') && <option value="injecao">Injeção</option>}
                                {can('registros', 'visualizar') && <option value="recebimento">Ficha Recebimento</option>}
                                {can('registros', 'visualizar') && <option value="entrada-mp">Entrada MP</option>}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Linha / Máquina / Local</label>
                            <select
                                className="form-control"
                                value={filtros.local}
                                onChange={(e) => setFiltros({ ...filtros, local: e.target.value, turno: '' })}
                            >
                                <option value="">Todos</option>
                                {getLocaisDisponiveis().map((local) => (
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
                                <option value="">Todos os Turnos</option>
                                {getTurnosDisponiveis().map((turno) => (
                                    <option key={turno} value={turno}>{formatarTurno(turno)}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* KPIs Cards */}
                <div className="kpi-grid">
                    <div className="kpi-card kpi-success">
                        <div className="kpi-icon">
                            <i className="fas fa-check-circle"></i>
                        </div>
                        <div className="kpi-content">
                            <div className="kpi-value">{indicadores.taxaAprovacao}%</div>
                            <div className="kpi-label">Taxa de Aprovação</div>
                            <div className="kpi-meta">
                                <i className="fas fa-chart-line"></i> Meta: 95%
                            </div>
                        </div>
                        <div className={`kpi-progress ${parseFloat(indicadores.taxaAprovacao) >= 95 ? 'on-target' : 'off-target'}`}>
                            <div className="progress-bar" style={{ width: `${Math.min(indicadores.taxaAprovacao, 100)}%` }}></div>
                        </div>
                    </div>

                    <div className="kpi-card kpi-danger">
                        <div className="kpi-icon">
                            <i className="fas fa-times-circle"></i>
                        </div>
                        <div className="kpi-content">
                            <div className="kpi-value">{indicadores.taxaReprovacao}%</div>
                            <div className="kpi-label">Taxa de Reprovação</div>
                            <div className="kpi-meta">
                                <i className="fas fa-exclamation-triangle"></i> Limite: 5%
                            </div>
                        </div>
                        <div className={`kpi-progress ${parseFloat(indicadores.taxaReprovacao) <= 5 ? 'on-target' : 'off-target'}`}>
                            <div className="progress-bar" style={{ width: `${Math.min(indicadores.taxaReprovacao * 10, 100)}%` }}></div>
                        </div>
                    </div>

                    <div className="kpi-card kpi-primary">
                        <div className="kpi-icon">
                            <i className="fas fa-clipboard-list"></i>
                        </div>
                        <div className="kpi-content">
                            <div className="kpi-value">{indicadores.totalInspecoes}</div>
                            <div className="kpi-label">Total de Inspeções</div>
                            <div className="kpi-meta">
                                <i className="fas fa-calendar"></i> Período: {filtros.periodo} dias
                            </div>
                        </div>
                        <div className={`kpi-tendencia ${getTendenciaClass()}`}>
                            {getTendenciaIcon()}
                        </div>
                    </div>

                    <div className="kpi-card kpi-warning">
                        <div className="kpi-icon">
                            <i className="fas fa-exclamation-triangle"></i>
                        </div>
                        <div className="kpi-content">
                            <div className="kpi-value">{indicadores.totalNC}</div>
                            <div className="kpi-label">Não Conformidades</div>
                            <div className="kpi-meta">
                                <i className="fas fa-chart-bar"></i> Média: {indicadores.mediaDiaria}/dia
                            </div>
                        </div>
                    </div>
                </div>

                {/* Gráficos - Primeira linha */}
                <div className="charts-grid">
                    <div className="chart-card chart-wide">
                        <div className="chart-header">
                            <h3 className="chart-title">
                                <i className="fas fa-chart-area"></i> Evolução das Inspeções
                            </h3>
                        </div>
                        <div className="chart-container">
                            {!loading && filtrarIndicadores(normalizarInspecoes()).length > 0 && (
                                <Line
                                    key={theme}
                                    data={getEvolucaoData()}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: { position: 'top' },
                                            tooltip: {
                                                ...tooltipStyle,
                                                callbacks: getPercentageCallback('stack')
                                            }
                                        },
                                        scales: {
                                            y: {
                                                beginAtZero: true,
                                                ticks: { stepSize: 1, padding: 8 },
                                                grid: { drawTicks: false },
                                                border: { display: false }
                                            },
                                            x: {
                                                grid: { display: false },
                                                border: { display: false }
                                            }
                                        },
                                        animation: { duration: 900, easing: 'easeOutQuart' }
                                    }}
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Gráficos - Segunda linha */}
                <div className="charts-grid charts-grid-3">
                    <div className="chart-card">
                        <div className="chart-header">
                            <h3 className="chart-title">
                                <i className="fas fa-industry"></i> Por Linha de Montagem
                            </h3>
                        </div>
                        <div className="chart-container">
                            {!loading && getMontagemFiltrada().length > 0 && (
                                <Bar
                                    key={theme}
                                    data={getLinhasData()}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: { position: 'top' },
                                            tooltip: {
                                                ...tooltipStyle,
                                                callbacks: getPercentageCallback('stack')
                                            }
                                        },
                                        scales: {
                                            y: {
                                                beginAtZero: true,
                                                ticks: { stepSize: 1, padding: 8 },
                                                grid: { drawTicks: false },
                                                border: { display: false }
                                            },
                                            x: {
                                                grid: { display: false },
                                                border: { display: false },
                                                stacked: false
                                            }
                                        },
                                        animation: { duration: 900, easing: 'easeOutQuart' }
                                    }}
                                />
                            )}
                        </div>
                    </div>

                    <div className="chart-card">
                        <div className="chart-header">
                            <h3 className="chart-title">
                                <i className="fas fa-bug"></i> Top 5 Defeitos
                            </h3>
                        </div>
                        <div className="chart-container">
                            {!loading && (
                                <Doughnut key={theme}
                                    data={getDefeitosData()}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        cutout: '70%',
                                        plugins: {
                                            legend: {
                                                position: 'right',
                                                labels: {
                                                    padding: 18,
                                                    font: { size: 12 },
                                                    usePointStyle: true,
                                                    pointStyle: 'circle',
                                                    boxWidth: 8,
                                                    boxHeight: 8
                                                }
                                            },
                                            tooltip: {
                                                ...tooltipStyle,
                                                callbacks: getPercentageCallback('pie')
                                            }
                                        },
                                        animation: { duration: 900, easing: 'easeOutQuart' }
                                    }}
                                />
                            )}
                        </div>
                    </div>

                    <div className="chart-card">
                        <div className="chart-header">
                            <h3 className="chart-title">
                                <i className="fas fa-clock"></i> Comparativo por Turno
                            </h3>
                        </div>
                        <div className="chart-container">
                            {!loading && registros.length > 0 && (
                                <Bar
                                    key={theme}
                                    data={getTurnoData()}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: { position: 'top' },
                                            tooltip: {
                                                ...tooltipStyle,
                                                callbacks: getPercentageCallback('turno')
                                            }
                                        },
                                        scales: {
                                            y: {
                                                beginAtZero: true,
                                                ticks: { stepSize: 1, padding: 8 },
                                                grid: { drawTicks: false },
                                                border: { display: false }
                                            },
                                            x: {
                                                grid: { display: false },
                                                border: { display: false }
                                            }
                                        },
                                        animation: { duration: 900, easing: 'easeOutQuart' }
                                    }}
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Gráficos - Outras inspeções */}
                <div className="charts-grid charts-grid-3">
                    <div className="chart-card">
                        <div className="chart-header">
                            <h3 className="chart-title">
                                <i className="fas fa-industry"></i> Injeção por Máquina
                            </h3>
                        </div>
                        <div className="chart-container">
                            {!loading && getInjecoesFiltradas().length > 0 && (
                                <Bar
                                    key={theme}
                                    data={getInjecaoMaquinaData()}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: { position: 'top' },
                                            tooltip: {
                                                ...tooltipStyle,
                                                callbacks: getPercentageCallback('stack')
                                            }
                                        },
                                        scales: {
                                            y: {
                                                beginAtZero: true,
                                                ticks: { stepSize: 1, padding: 8 },
                                                grid: { drawTicks: false },
                                                border: { display: false }
                                            },
                                            x: {
                                                grid: { display: false },
                                                border: { display: false }
                                            }
                                        },
                                        animation: { duration: 900, easing: 'easeOutQuart' }
                                    }}
                                />
                            )}
                        </div>
                    </div>

                    <div className="chart-card">
                        <div className="chart-header">
                            <h3 className="chart-title">
                                <i className="fas fa-chart-pie"></i> Status da Injeção
                            </h3>
                        </div>
                        <div className="chart-container">
                            {!loading && getInjecoesFiltradas().length > 0 && (
                                <Doughnut
                                    key={theme}
                                    data={getInjecaoStatusData()}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        cutout: '70%',
                                        plugins: {
                                            legend: {
                                                position: 'right',
                                                labels: {
                                                    padding: 18,
                                                    font: { size: 12 },
                                                    usePointStyle: true,
                                                    pointStyle: 'circle',
                                                    boxWidth: 8,
                                                    boxHeight: 8
                                                }
                                            },
                                            tooltip: {
                                                ...tooltipStyle,
                                                callbacks: getPercentageCallback('pie')
                                            }
                                        },
                                        animation: { duration: 900, easing: 'easeOutQuart' }
                                    }}
                                />
                            )}
                        </div>
                    </div>

                    <div className="chart-card">
                        <div className="chart-header">
                            <h3 className="chart-title">
                                <i className="fas fa-clipboard-check"></i> Outras Inspeções
                            </h3>
                        </div>
                        <div className="chart-container">
                            {!loading && (getFichasRecebimentoFiltradas().length > 0 || getEntradasMateriaPrimaFiltradas().length > 0) && (
                                <Bar
                                    key={theme}
                                    data={getOutrasInspecoesData()}
                                    options={{
                                        responsive: true,
                                        maintainAspectRatio: false,
                                        plugins: {
                                            legend: { position: 'top' },
                                            tooltip: {
                                                ...tooltipStyle,
                                                callbacks: getPercentageCallback('stack')
                                            }
                                        },
                                        scales: {
                                            y: {
                                                beginAtZero: true,
                                                ticks: { stepSize: 1, padding: 8 },
                                                grid: { drawTicks: false },
                                                border: { display: false }
                                            },
                                            x: {
                                                grid: { display: false },
                                                border: { display: false }
                                            }
                                        },
                                        animation: { duration: 900, easing: 'easeOutQuart' }
                                    }}
                                />
                            )}
                        </div>
                    </div>
                </div>

                {/* Tabela Resumo */}
                <div className="table-card printable">
                    <div className="table-header">
                        <h3 className="table-title">
                            <i className="fas fa-table"></i> Resumo por Tipo de Inspeção
                        </h3>
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Tipo</th>
                                    <th>Total Inspeções</th>
                                    <th>Aprovados</th>
                                    <th>Reprovados</th>
                                    <th>Pendentes</th>
                                    <th>Taxa Aprovação</th>
                                    <th>Qtd NC</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="7">
                                            <div className="loading">
                                                <div className="loading-spinner"></div>
                                                <p>Carregando...</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    (() => {
                                        const resumo = {};
                                        filtrarIndicadores(normalizarInspecoes()).forEach(reg => {
                                            const tipo = reg.tipoLabel || 'Inspeção';
                                            if (!resumo[tipo]) {
                                                resumo[tipo] = { total: 0, aprovados: 0, reprovados: 0, pendentes: 0, nc: 0 };
                                            }
                                            resumo[tipo].total++;
                                            if (reg.status?.toLowerCase() === 'aprovado') resumo[tipo].aprovados++;
                                            else if (reg.status?.toLowerCase() === 'reprovado') resumo[tipo].reprovados++;
                                            else resumo[tipo].pendentes++;
                                            resumo[tipo].nc += reg.qtd_nc || 0;
                                        });

                                        return Object.entries(resumo).sort((a, b) => a[0].localeCompare(b[0])).map(([tipo, dados]) => (
                                            <tr key={tipo}>
                                                <td><strong>{tipo}</strong></td>
                                                <td>{dados.total}</td>
                                                <td><span className="badge badge-success">{dados.aprovados}</span></td>
                                                <td><span className="badge badge-danger">{dados.reprovados}</span></td>
                                                <td><span className="badge badge-warning">{dados.pendentes}</span></td>
                                                <td>
                                                    <span className={`badge ${dados.total > 0 && (dados.aprovados / dados.total) >= 0.95 ? 'badge-success' : 'badge-warning'}`}>
                                                        {dados.total > 0 ? ((dados.aprovados / dados.total) * 100).toFixed(1) : 0}%
                                                    </span>
                                                </td>
                                                <td>{dados.nc}</td>
                                            </tr>
                                        ));
                                    })()
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
