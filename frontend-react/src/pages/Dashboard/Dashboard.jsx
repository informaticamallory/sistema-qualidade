import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Chart as ChartJS,
    ArcElement, Tooltip, Legend,
    CategoryScale, LinearScale, BarElement,
    LineElement, PointElement, Filler,
    RadialLinearScale
} from 'chart.js';
import { Bar, Bubble, Doughnut, Line, Pie, Radar, PolarArea } from 'react-chartjs-2';
import Sidebar from '../../components/Sidebar/Sidebar';
import { dashboardAPI } from '../../services/api';
import { useTheme } from '../../context/theme-context';
import './Dashboard.css';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Filler, RadialLinearScale);

const POLL_INTERVAL = 5000;
const BACKOFF_429 = 120000;
const STORAGE_KEY = 'mallory-dashboard-layout-v2';

const DEFAULT_BUILDER = {
    metrics: [],
    datasets: [],
    chartTypes: [
        { id: 'bar', label: 'Coluna', icon: 'fa-chart-column' },
        { id: 'horizontalBar', label: 'Barra', icon: 'fa-chart-bar' },
        { id: 'line', label: 'Linha', icon: 'fa-chart-line' },
        { id: 'pie', label: 'Pizza', icon: 'fa-chart-pie' },
        { id: 'doughnut', label: 'Rosca', icon: 'fa-circle-notch' },
        { id: 'area', label: 'Área', icon: 'fa-chart-area' },
        { id: 'radar', label: 'Radar', icon: 'fa-spider' },
        { id: 'polarArea', label: 'Polar', icon: 'fa-circle-half-stroke' },
        { id: 'stackedBar', label: 'Coluna Empil.', icon: 'fa-layer-group' },
        { id: 'stackedHBar', label: 'Barra Empil.', icon: 'fa-bars' },
        { id: 'multiLine', label: 'Multi-Linha', icon: 'fa-chart-line' },
        { id: 'bubble', label: 'Bolhas', icon: 'fa-circle-dot' }
    ],
    sizes: [
        { id: 'sm', label: 'Pequeno' },
        { id: 'md', label: 'Médio' },
        { id: 'lg', label: 'Grande' },
        { id: 'xl', label: 'Largo' }
    ]
};

const SIZE_STEPS = ['sm', 'md', 'lg', 'xl'];

const DEFAULT_WIDGETS = [
    { id: 'kpi-total', type: 'metric', metricId: 'total-inspecoes', size: 'sm' },
    { id: 'kpi-aprovacao', type: 'metric', metricId: 'taxa-aprovacao', size: 'sm' },
    { id: 'kpi-reprovacao', type: 'metric', metricId: 'taxa-reprovacao', size: 'sm' },
    { id: 'kpi-q49', type: 'metric', metricId: 'q49-produto-importado', size: 'sm' },
    { id: 'kpi-cartoes', type: 'metric', metricId: 'cartoes-qualidade', size: 'sm' },
    { id: 'kpi-calibracoes', type: 'metric', metricId: 'calibracoes', size: 'sm' },
    { id: 'chart-status', type: 'chart', datasetId: 'status-geral', chartType: 'doughnut', size: 'md' },
    { id: 'chart-produtos-reprovados', type: 'chart', datasetId: 'produtos-mais-reprovados', chartType: 'horizontalBar', size: 'lg' },
    { id: 'chart-dia', type: 'chart', datasetId: 'inspecoes-por-dia', chartType: 'line', size: 'xl' }
];

function loadSavedWidgets() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        return Array.isArray(saved) && saved.length ? saved : DEFAULT_WIDGETS;
    } catch {
        return DEFAULT_WIDGETS;
    }
}

function newWidgetId() {
    return `dash-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatNumber(value) {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(Number(value || 0));
}

function toDateInput(date) {
    return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function rangeForPreset(preset) {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    if (preset === '7d') return { startDate: toDateInput(addDays(today, -6)), endDate: toDateInput(today) };
    if (preset === '30d') return { startDate: toDateInput(addDays(today, -29)), endDate: toDateInput(today) };
    if (preset === 'month') return { startDate: toDateInput(startOfMonth), endDate: toDateInput(today) };
    if (preset === 'year') return { startDate: toDateInput(startOfYear), endDate: toDateInput(today) };
    if (preset === 'all') return { startDate: '', endDate: '' };
    return { startDate: toDateInput(addDays(today, -29)), endDate: toDateInput(today) };
}

function previousPeriod(startDate, endDate) {
    if (!startDate || !endDate) return { compareStartDate: '', compareEndDate: '' };
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const previousEnd = addDays(start, -1);
    const previousStart = addDays(previousEnd, -(days - 1));
    return { compareStartDate: toDateInput(previousStart), compareEndDate: toDateInput(previousEnd) };
}

function defaultFilters() {
    return {
        preset: '30d',
        ...rangeForPreset('30d'),
        compareEnabled: false,
        compareStartDate: '',
        compareEndDate: ''
    };
}
export default function Dashboard() {
    const [builder, setBuilder] = useState(DEFAULT_BUILDER);
    const [registros, setRegistros] = useState([]);
    const [widgets, setWidgets] = useState(loadSavedWidgets);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [filters, setFilters] = useState(defaultFilters);
    const [editMode, setEditMode] = useState(false);
    const [draggingId, setDraggingId] = useState(null);
    const [dragOverId, setDragOverId] = useState(null);
    const [composerOpen, setComposerOpen] = useState(false);
    const [draft, setDraft] = useState({ type: 'metric', metricId: '', datasetId: '', chartType: 'bar', size: 'md', title: '' });
    const [expandedWidgets, setExpandedWidgets] = useState(new Set());
    const [calendarOpen, setCalendarOpen] = useState(false);
    const inFlight = useRef(false);
    const backoffUntil = useRef(0);
    const wheelResizeAt = useRef(0);
    const calendarRef = useRef(null);
    const resizingWidget = useRef(null);
    const resizeStartX = useRef(0);
    const resizeStartWidth = useRef(0);
    const { theme } = useTheme();

    const metricsById = useMemo(() => new Map((builder.metrics || []).map((item) => [item.id, item])), [builder.metrics]);
    const datasetsById = useMemo(() => new Map((builder.datasets || []).map((item) => [item.id, item])), [builder.datasets]);
    const dashboardParams = useMemo(() => {
        const params = {};
        if (filters.startDate) params.start_date = filters.startDate;
        if (filters.endDate) params.end_date = filters.endDate;
        if (filters.compareEnabled && filters.compareStartDate && filters.compareEndDate) {
            params.compare = '1';
            params.compare_start_date = filters.compareStartDate;
            params.compare_end_date = filters.compareEndDate;
        }
        return params;
    }, [filters]);

    const loadDashboard = useCallback(async (manual = false) => {
        if (inFlight.current) return;
        if (!manual && Date.now() < backoffUntil.current) return;
        inFlight.current = true;

        try {
            const [builderResult, registrosResult] = await Promise.allSettled([
                dashboardAPI.getBuilderData(dashboardParams),
                dashboardAPI.getUltimasInspecoes({ limit: 10, ...dashboardParams })
            ]);

            if (builderResult.status === 'fulfilled' && builderResult.value?.data.success) {
                const incoming = builderResult.value.data.data ?? {};
                const mergedChartTypes = [
                    ...DEFAULT_BUILDER.chartTypes,
                    ...(incoming.chartTypes ?? [])
                ].filter(
                    (item, index, self) => self.findIndex(t => t.id === item.id) === index
                );

                setBuilder({
                    ...DEFAULT_BUILDER,
                    ...incoming,
                    chartTypes: mergedChartTypes
                });
            }

            if (registrosResult.status === 'fulfilled' && registrosResult.value?.data.success) {
                setRegistros(registrosResult.value.data.data);
            }

            const failed = [builderResult, registrosResult].filter((result) => result.status === 'rejected');
            const rateLimited = failed.some((result) => result.reason?.response?.status === 429);
            if (rateLimited) {
                backoffUntil.current = Date.now() + BACKOFF_429;
                setError('Muitas requisições ao servidor. A atualização automática foi pausada por alguns minutos.');
            } else {
                backoffUntil.current = 0;
                setError(failed.length ? 'Alguns dados do dashboard não puderam ser carregados.' : null);
            }
        } catch {
            setError('Não foi possível carregar os dados do dashboard.');
        } finally {
            inFlight.current = false;
            setLoading(false);
        }
    }, [dashboardParams]);

    useEffect(() => {
        loadDashboard(true);

        const refreshIfVisible = () => {
            if (document.visibilityState === 'visible') loadDashboard();
        };

        const refreshOnReturn = () => {
            if (document.visibilityState === 'visible') loadDashboard(true);
        };

        const interval = setInterval(refreshIfVisible, POLL_INTERVAL);
        window.addEventListener('focus', refreshOnReturn);
        document.addEventListener('visibilitychange', refreshOnReturn);

        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', refreshOnReturn);
            document.removeEventListener('visibilitychange', refreshOnReturn);
        };
    }, [loadDashboard]);

    useEffect(() => {
        const handler = (e) => {
            if (calendarRef.current && !calendarRef.current.contains(e.target))
                setCalendarOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
        } catch {
            // O dashboard continua funcional mesmo sem persistência local.
        }
    }, [widgets]);

    const token = (name, fallback) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    const palette = () => [
        token('--primary', '#ff7900'),
        token('--success', '#25a244'),
        token('--info', '#2563eb'),
        token('--warning', '#f59e0b'),
        token('--danger', '#dc2626'),
        '#8b5cf6', '#14b8a6', '#64748b', '#f97316', '#0ea5e9'
    ];

    const chartTypesFor = (dataset) => {
        const allKnownIds = (builder.chartTypes || DEFAULT_BUILDER.chartTypes)
            .map(t => t.id);

        // If backend sends supportedCharts, merge it with all known types
        // so new frontend types are always available.
        // If backend sends nothing, allow everything.
        const backendSupported = dataset?.supportedCharts ?? [];
        const supported = backendSupported.length
            ? [...new Set([...backendSupported, ...allKnownIds])]
            : allKnownIds;

        return (builder.chartTypes || DEFAULT_BUILDER.chartTypes)
            .filter(type => supported.includes(type.id));
    };

    const statusColor = (label) => {
        const status = String(label || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (status.includes('aprov')) return token('--success', '#20a967');
        if (status.includes('pend')) return token('--warning', '#d89000');
        if (status.includes('reprov')) return token('--danger', '#d94831');
        if (status.includes('vencendo')) return token('--vencendo', '#eab308');
        if (status.includes('vencid')) return token('--danger', '#d94831');
        return null;
    };

    const chartColors = (dataset, labels) => {
        const isStatusDataset = dataset?.id === 'status-geral' || dataset?.title?.toLowerCase().includes('status');
        const defaultPalette = palette();
        return labels.map((label, index) => (
            isStatusDataset ? statusColor(label) : null
        ) || defaultPalette[index % defaultPalette.length]);
    };

    const chartData = (dataset, type) => {
        const labels = dataset?.labels || [];
        const values = dataset?.values || [];
        const colors = chartColors(dataset, labels);

        if (type === 'line') {
            return {
                labels,
                datasets: [{
                    label: dataset.title,
                    data: values,
                    borderColor: token('--primary', '#ff7900'),
                    backgroundColor: token('--primary-soft', 'rgba(255, 121, 0, 0.14)'),
                    pointBackgroundColor: token('--primary', '#ff7900'),
                    pointBorderColor: token('--surface', '#fff'),
                    pointRadius: 4,
                    borderWidth: 3,
                    tension: 0.35,
                    fill: true
                }]
            };
        }

        if (type === 'area') {
            return {
                labels,
                datasets: [{
                    label: dataset.title,
                    data: values,
                    borderColor: token('--primary', '#ff7900'),
                    backgroundColor: token('--primary-soft', 'rgba(255,121,0,0.18)'),
                    pointBackgroundColor: token('--primary', '#ff7900'),
                    pointBorderColor: token('--surface', '#fff'),
                    pointRadius: 4,
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true
                }]
            };
        }

        if (type === 'radar') {
            const pal = palette();
            return {
                labels,
                datasets: [{
                    label: dataset.title,
                    data: values,
                    backgroundColor: pal[0] + '33',
                    borderColor: pal[0],
                    pointBackgroundColor: pal[0],
                    borderWidth: 2,
                    pointRadius: 4
                }]
            };
        }

        if (type === 'polarArea') {
            const colors = chartColors(dataset, labels);
            return {
                labels,
                datasets: [{
                    label: dataset.title,
                    data: values,
                    backgroundColor: colors.map(c => c + 'bb'),
                    borderColor: colors,
                    borderWidth: 2
                }]
            };
        }

        if (type === 'stackedBar') {
            const pal = palette();
            return {
                labels,
                datasets: [{
                    label: dataset.title,
                    data: values,
                    backgroundColor: labels.map((_, i) => pal[i % pal.length]),
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 46
                }]
            };
        }

        if (type === 'stackedHBar') {
            const pal = palette();
            return {
                labels,
                datasets: [{
                    label: dataset.title,
                    data: values,
                    backgroundColor: labels.map((_, i) => pal[i % pal.length]),
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 36
                }]
            };
        }

        if (type === 'multiLine') {
            const pal = palette();
            const mid = Math.ceil(values.length / 2);
            return {
                labels,
                datasets: [
                    {
                        label: dataset.title,
                        data: values,
                        borderColor: pal[0],
                        backgroundColor: pal[0] + '22',
                        pointBackgroundColor: pal[0],
                        pointRadius: 4,
                        borderWidth: 2,
                        tension: 0.35,
                        fill: false
                    },
                    {
                        label: dataset.title + ' (anterior)',
                        data: [...values.slice(mid), ...values.slice(0, mid)],
                        borderColor: pal[2],
                        backgroundColor: pal[2] + '22',
                        pointBackgroundColor: pal[2],
                        pointRadius: 4,
                        borderWidth: 2,
                        tension: 0.35,
                        fill: false,
                        borderDash: [5, 4]
                    }
                ]
            };
        }

        if (type === 'bubble') {
            const pal = palette();
            return {
                labels,
                datasets: [{
                    label: dataset.title,
                    data: values.map((v, i) => ({
                        x: i + 1,
                        y: Number(v),
                        r: Math.max(4, Math.min(28, Number(v) / 2))
                    })),
                    backgroundColor: labels.map((_, i) => pal[i % pal.length] + 'bb'),
                    borderColor: labels.map((_, i) => pal[i % pal.length]),
                    borderWidth: 2
                }]
            };
        }
        return {
            labels,
            datasets: [{
                label: dataset.title,
                data: values,
                backgroundColor: colors,
                hoverBackgroundColor: colors,
                borderColor: type === 'pie' || type === 'doughnut' ? token('--surface', '#fff') : 'transparent',
                borderWidth: type === 'pie' || type === 'doughnut' ? 3 : 0,
                borderRadius: type === 'pie' || type === 'doughnut' ? 0 : 8,
                borderSkipped: false,
                maxBarThickness: 46,
                hoverOffset: 8
            }]
        };
    };

    const chartOptions = (type) => {
        const radial = ['pie', 'doughnut', 'polarArea', 'radar'].includes(type);
        const textColor = token('--text-muted', '#64748b');
        const gridColor = token('--border', '#e2e8f0');
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: type === 'horizontalBar' ? 'y' : 'x',
            plugins: {
                legend: {
                    display: radial,
                    position: 'bottom',
                    labels: { color: textColor, padding: 16, usePointStyle: true, pointStyle: 'circle', boxWidth: 8, boxHeight: 8 }
                },
                tooltip: { backgroundColor: 'rgba(17, 21, 28, 0.92)', titleColor: '#fff', bodyColor: '#cbd5e1', padding: 12, cornerRadius: 10 }
            },
            animation: { duration: 850, easing: 'easeOutQuart' }
        };

        if (!radial) {
            options.scales = {
                x: { beginAtZero: true, ticks: { color: textColor, precision: 0, padding: 8 }, grid: { color: type === 'line' ? gridColor : 'transparent', drawTicks: false }, border: { display: false } },
                y: { beginAtZero: type !== 'horizontalBar', ticks: { color: textColor, precision: 0, padding: 8 }, grid: { color: type === 'horizontalBar' ? 'transparent' : gridColor, drawTicks: false }, border: { display: false } }
            };
        }

        if (type === 'line') options.plugins.legend.display = false;
        if (type === 'doughnut') options.cutout = '68%';
        if (type === 'area') {
            options.plugins.legend.display = false;
            options.scales = {
                x: {
                    beginAtZero: false,
                    ticks: { color: textColor, precision: 0, padding: 8 },
                    grid: { color: gridColor, drawTicks: false },
                    border: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: textColor, precision: 0, padding: 8 },
                    grid: { color: gridColor, drawTicks: false },
                    border: { display: false }
                }
            };
        }

        if (type === 'radar') {
            options.scales = {
                r: {
                    angleLines: { color: gridColor },
                    grid: { color: gridColor },
                    pointLabels: { color: textColor, font: { size: 11 } },
                    ticks: {
                        color: textColor,
                        backdropColor: 'transparent',
                        stepSize: 1
                    }
                }
            };
        }

        if (type === 'stackedBar') {
            options.scales.x.stacked = true;
            options.scales.y.stacked = true;
        }

        if (type === 'stackedHBar') {
            options.indexAxis = 'y';
            options.scales.x.stacked = true;
            options.scales.y.stacked = true;
        }

        if (type === 'bubble') {
            options.scales = {
                x: {
                    beginAtZero: true,
                    ticks: { color: textColor, precision: 0, padding: 8 },
                    grid: { color: gridColor, drawTicks: false },
                    border: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: textColor, precision: 0, padding: 8 },
                    grid: { color: gridColor, drawTicks: false },
                    border: { display: false }
                }
            };
        }

        if (type === 'multiLine') {
            options.plugins.legend.display = true;
        }
        return options;
    };

    const renderChart = (widget, dataset) => {
        const type = widget.chartType || dataset?.defaultChart || 'bar';
        const hasData = (dataset?.values || []).some((value) => Number(value || 0) > 0);
        if (!hasData) {
            return <div className="chart-state"><i className="fas fa-chart-pie"></i><p>{loading ? 'Carregando dados...' : 'Sem dados para exibir'}</p></div>;
        }

        const data = chartData(dataset, type);
        const options = chartOptions(type);
        const key = `${theme}-${widget.id}-${dataset.id}-${type}`;
        if (type === 'pie') return <Pie key={key} data={data} options={options} />;
        if (type === 'doughnut') return <Doughnut key={key} data={data} options={options} />;
        if (type === 'line') return <Line key={key} data={data} options={options} />;
        if (type === 'area') return <Line key={key} data={data} options={options} />;
        if (type === 'radar') return <Radar key={key} data={data} options={options} />;
        if (type === 'polarArea') return <PolarArea key={key} data={data} options={options} />;
        if (type === 'stackedBar') return <Bar key={key} data={data} options={options} />;
        if (type === 'stackedHBar') return <Bar key={key} data={data} options={options} />;
        if (type === 'multiLine') return <Line key={key} data={data} options={options} />;
        if (type === 'bubble') return <Bubble key={key} data={data} options={options} />;
        return <Bar key={key} data={data} options={options} />;
    };

    const moveWidget = (index, direction) => {
        setWidgets((current) => {
            const target = index + direction;
            if (target < 0 || target >= current.length) return current;
            const next = [...current];
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });
    };

    const moveWidgetTo = (sourceId, targetId) => {
        setWidgets((current) => {
            const sourceIndex = current.findIndex((item) => item.id === sourceId);
            const targetIndex = current.findIndex((item) => item.id === targetId);
            if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current;
            const next = [...current];
            const [moved] = next.splice(sourceIndex, 1);
            next.splice(targetIndex, 0, moved);
            return next;
        });
    };

    const handleDrop = (targetId, sourceId = draggingId) => {
        if (sourceId && sourceId !== targetId) moveWidgetTo(sourceId, targetId);
        setDraggingId(null);
        setDragOverId(null);
    };

    const resizeWidget = (widgetId, direction) => {
        setWidgets((current) => current.map((item) => {
            if (item.id !== widgetId) return item;
            const currentIndex = Math.max(0, SIZE_STEPS.indexOf(item.size || 'md'));
            const nextIndex = Math.min(SIZE_STEPS.length - 1, Math.max(0, currentIndex + direction));
            return { ...item, size: SIZE_STEPS[nextIndex] };
        }));
    };

    const handleWheelResize = (event, widgetId) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        const now = Date.now();
        if (now - wheelResizeAt.current < 180) return;
        wheelResizeAt.current = now;
        resizeWidget(widgetId, event.deltaY < 0 ? 1 : -1);
    };

    const updateWidget = (widgetId, updates) => setWidgets((current) => current.map((item) => item.id === widgetId ? { ...item, ...updates } : item));
    const removeWidget = (widgetId) => setWidgets((current) => current.filter((item) => item.id !== widgetId));
    const resetLayout = () => { setWidgets(DEFAULT_WIDGETS); setEditMode(false); };

    const openComposer = () => {
        const firstMetric = builder.metrics?.[0]?.id || '';
        const firstDataset = builder.datasets?.[0];
        setDraft({ type: firstMetric ? 'metric' : 'chart', metricId: firstMetric, datasetId: firstDataset?.id || '', chartType: firstDataset?.defaultChart || 'bar', size: 'md', title: '' });
        setComposerOpen(true);
    };

    const handleDraftDataset = (datasetId) => {
        const dataset = datasetsById.get(datasetId);
        setDraft((current) => ({ ...current, datasetId, chartType: dataset?.supportedCharts?.includes(current.chartType) ? current.chartType : dataset?.defaultChart || 'bar' }));
    };

    const addWidget = (event) => {
        event.preventDefault();
        const base = draft.type === 'metric'
            ? { type: 'metric', metricId: draft.metricId }
            : { type: 'chart', datasetId: draft.datasetId, chartType: draft.chartType };
        setWidgets((current) => [...current, { id: newWidgetId(), ...base, size: draft.size, title: draft.title.trim() }]);
        setComposerOpen(false);
        setEditMode(true);
    };

    const applyPreset = (preset) => {
        setFilters((current) => {
            const range = rangeForPreset(preset);
            const compareRange = current.compareEnabled ? previousPeriod(range.startDate, range.endDate) : { compareStartDate: '', compareEndDate: '' };
            return { ...current, preset, ...range, ...compareRange };
        });
    };

    const updatePeriodDate = (field, value) => {
        setFilters((current) => {
            const next = { ...current, preset: 'custom', [field]: value };
            return current.compareEnabled ? { ...next, ...previousPeriod(next.startDate, next.endDate) } : next;
        });
    };

    const toggleCompare = (enabled) => {
        setFilters((current) => ({
            ...current,
            compareEnabled: enabled,
            ...(enabled ? previousPeriod(current.startDate, current.endDate) : { compareStartDate: '', compareEndDate: '' })
        }));
    };

    const updateCompareDate = (field, value) => {
        setFilters((current) => ({ ...current, compareEnabled: true, [field]: value }));
    };

    const toggleExpand = (widgetId) => {
        setExpandedWidgets(prev => {
            const next = new Set(prev);
            next.has(widgetId) ? next.delete(widgetId) : next.add(widgetId);
            return next;
        });
    };

    const startFreeResize = (e, widgetId) => {
        e.preventDefault();
        const article = e.currentTarget.closest('article');
        if (!article) return;

        document.body.classList.add('is-resizing-widget');
        resizingWidget.current = widgetId;
        resizeStartX.current = e.clientX;
        resizeStartWidth.current = article.offsetWidth;

        const onMove = (moveEvent) => {
            const delta = moveEvent.clientX - resizeStartX.current;
            const newWidth = resizeStartWidth.current + delta;
            const containerWidth = article.parentElement?.offsetWidth || 1200;

            const ratio = newWidth / containerWidth;
            let newSize = 'sm';
            if (ratio > 0.75)      newSize = 'xl';
            else if (ratio > 0.55) newSize = 'lg';
            else if (ratio > 0.35) newSize = 'md';
            else                   newSize = 'sm';

            setWidgets(current =>
                current.map(w => w.id === widgetId ? { ...w, size: newSize } : w)
            );
        };

        const onUp = () => {
            document.body.classList.remove('is-resizing-widget');
            resizingWidget.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const formatarData = (dataString) => {
        if (!dataString) return 'N/A';
        try { return new Date(dataString).toLocaleDateString('pt-BR'); } catch { return 'N/A'; }
    };

    const getStatusClass = (status) => ({ aprovado: 'badge-success', pendente: 'badge-warning', reprovado: 'badge-danger' }[status?.toLowerCase()] || 'badge-warning');
    const getStatusTexto = (status) => ({ aprovado: 'Aprovado', pendente: 'Pendente', reprovado: 'Reprovado' }[status?.toLowerCase()] || 'Pendente');
    const formatarHora = (data) => data ? data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
    const formatMetricComparison = (metric) => {
        if (metric.compare_value === undefined || metric.delta === undefined) return null;
        const delta = Number(metric.delta || 0);
        const signal = delta > 0 ? '+' : '';
        if (metric.suffix === '%') return `${signal}${formatNumber(delta)} p.p. vs comparação`;
        if (metric.delta_percent === null || metric.delta_percent === undefined) return `${signal}${formatNumber(delta)} vs comparação`;
        return `${signal}${formatNumber(metric.delta_percent)}% vs comparação`;
    };
    const selectedDraftDataset = datasetsById.get(draft.datasetId);
    const draftChartTypes = chartTypesFor(selectedDraftDataset);
    const canAdd = draft.type === 'metric' ? Boolean(draft.metricId) : Boolean(draft.datasetId && draft.chartType);
    return (
        <div className="app-container">
            <Sidebar />

            <main className="main-content dashboard-main">
                <div className="page-header dashboard-page-header">
                    <div className="page-title">
                        <h1><i className="fas fa-chart-line"></i> Dashboard de Qualidade</h1>
                        <p>Visão personalizada dos indicadores do sistema</p>
                        <div className="live-status" title="Todos os dashboards atualizam automaticamente a cada 5 segundos">
                            <span className="live-dot"></span>
                            <span>Ao vivo</span>
                            <span className="live-time">Atualizado {formatarHora(lastUpdated)}</span>
                        </div>
                    </div>
                    <div className="dashboard-actions">
                        <div className="calendar-filter-wrapper" ref={calendarRef}>
                            <button
                                type="button"
                                className={`btn icon-only ${calendarOpen ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => setCalendarOpen(v => !v)}
                                title="Filtrar período"
                                aria-label="Filtrar período"
                            >
                                <i className="fas fa-calendar-days"></i>
                            </button>

                            {calendarOpen && (
                                <div className="calendar-dropdown">
                                    <div className="calendar-presets">
                                        {[
                                            { id: '7d',    label: 'Últimos 7 dias'  },
                                            { id: '30d',   label: 'Últimos 30 dias' },
                                            { id: 'month', label: 'Este mês'        },
                                            { id: 'year',  label: 'Este ano'        },
                                            { id: 'all',   label: 'Todo período'    },
                                        ].map(p => (
                                            <button key={p.id} type="button"
                                                className={`preset-btn ${filters.preset === p.id ? 'active' : ''}`}
                                                onClick={() => { applyPreset(p.id); setCalendarOpen(false); }}>
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="calendar-divider">ou escolha o período</div>

                                    <div className="calendar-custom">
                                        <label>
                                            <span>De</span>
                                            <input type="date" className="form-control"
                                                value={filters.startDate}
                                                onChange={e => updatePeriodDate('startDate', e.target.value)} />
                                        </label>
                                        <label>
                                            <span>Até</span>
                                            <input type="date" className="form-control"
                                                value={filters.endDate}
                                                onChange={e => updatePeriodDate('endDate', e.target.value)} />
                                        </label>
                                    </div>

                                    <label className="calendar-compare-toggle">
                                        <input type="checkbox"
                                            checked={filters.compareEnabled}
                                            onChange={e => toggleCompare(e.target.checked)} />
                                        Comparar com período anterior
                                    </label>

                                    {filters.compareEnabled && (
                                        <div className="calendar-custom">
                                            <label>
                                                <span>Comparar de</span>
                                                <input type="date" className="form-control"
                                                    value={filters.compareStartDate}
                                                    onChange={e => updateCompareDate('compareStartDate', e.target.value)} />
                                            </label>
                                            <label>
                                                <span>Comparar até</span>
                                                <input type="date" className="form-control"
                                                    value={filters.compareEndDate}
                                                    onChange={e => updateCompareDate('compareEndDate', e.target.value)} />
                                            </label>
                                        </div>
                                    )}

                                    <div className="calendar-footer">
                                        <span className="calendar-active-label">
                                            {({ '7d': '7 dias', '30d': '30 dias', 'month': 'Este mês', 'year': 'Este ano', 'all': 'Todo período' })[filters.preset]
                                                ?? `${filters.startDate} → ${filters.endDate}`}
                                        </span>
                                        <button type="button" className="btn btn-sm btn-ghost"
                                            onClick={() => { applyPreset('30d'); setCalendarOpen(false); }}>
                                            Limpar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <button type="button" className="btn icon-only btn-primary" onClick={openComposer} title="Criar Dash" aria-label="Criar Dash"><i className="fas fa-plus"></i></button>
                        <button type="button" className={`btn icon-only ${editMode ? 'btn-primary' : 'btn-outline'}`} onClick={() => setEditMode((value) => !value)} title="Personalizar" aria-label="Personalizar"><i className="fas fa-sliders"></i></button>
                        <button type="button" className="btn icon-only btn-ghost" onClick={() => loadDashboard(true)} title="Atualizar" aria-label="Atualizar"><i className="fas fa-rotate-right"></i></button>
                    </div>
                </div>

                {error && (
                    <div className="page-alert">
                        <i className="fas fa-exclamation-triangle"></i>
                        <span>{error}</span>
                        <button className="btn btn-outline btn-sm" onClick={() => loadDashboard(true)}><i className="fas fa-rotate-right"></i> Tentar novamente</button>
                    </div>
                )}

                {composerOpen && (
                    <form className="dashboard-composer" onSubmit={addWidget}>
                        <div className="composer-header">
                            <h2><i className="fas fa-plus-circle"></i> Novo Dash</h2>
                            <button type="button" className="icon-button" onClick={() => setComposerOpen(false)} aria-label="Fechar"><i className="fas fa-times"></i></button>
                        </div>

                        <div className="composer-grid">
                            <label className="form-field">
                                <span>Tipo</span>
                                <select className="form-control" value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}>
                                    <option value="metric">Indicador</option>
                                    <option value="chart">Gráfico</option>
                                </select>
                            </label>

                            {draft.type === 'metric' ? (
                                <label className="form-field composer-field-wide">
                                    <span>Informação</span>
                                    <select className="form-control" value={draft.metricId} onChange={(event) => setDraft((current) => ({ ...current, metricId: event.target.value }))}>
                                        {(builder.metrics || []).map((metric) => <option key={metric.id} value={metric.id}>{metric.title}</option>)}
                                    </select>
                                </label>
                            ) : (
                                <>
                                    <label className="form-field composer-field-wide">
                                        <span>Informação</span>
                                        <select className="form-control" value={draft.datasetId} onChange={(event) => handleDraftDataset(event.target.value)}>
                                            {(builder.datasets || []).map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.title}</option>)}
                                        </select>
                                    </label>
                                    <label className="form-field">
                                        <span>Visual</span>
                                        <select className="form-control" value={draft.chartType} onChange={(event) => setDraft((current) => ({ ...current, chartType: event.target.value }))}>
                                            {draftChartTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                                        </select>
                                        {draft.type === 'chart' && selectedDraftDataset?.supportedCharts?.length > 0 && (
                                            <p className="composer-hint">
                                                <i className="fas fa-circle-info"></i>
                                                Todos os tipos de gráfico estão disponíveis.
                                                Tipos recomendados pelo servidor aparecem primeiro.
                                            </p>
                                        )}
                                    </label>
                                </>
                            )}

                            <label className="form-field">
                                <span>Tamanho</span>
                                <select className="form-control" value={draft.size} onChange={(event) => setDraft((current) => ({ ...current, size: event.target.value }))}>
                                    {(builder.sizes || DEFAULT_BUILDER.sizes).map((size) => <option key={size.id} value={size.id}>{size.label}</option>)}
                                </select>
                            </label>

                            <label className="form-field composer-field-wide">
                                <span>Título</span>
                                <input className="form-control" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Opcional" />
                            </label>
                        </div>

                        <div className="composer-footer">
                            <button type="button" className="btn btn-ghost" onClick={() => setComposerOpen(false)}>Cancelar</button>
                            <button type="submit" className="btn btn-primary" disabled={!canAdd}><i className="fas fa-check"></i> Adicionar</button>
                        </div>
                    </form>
                )}

                {editMode && (
                    <div className="layout-toolbar">
                        <span><i className="fas fa-grip"></i> Layout</span>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={resetLayout}><i className="fas fa-rotate-left"></i> Restaurar padrão</button>
                    </div>
                )}

                <section className="dashboard-builder-grid">
                    {widgets.map((widget, index) => {
                        const metric = widget.type === 'metric' ? metricsById.get(widget.metricId) : null;
                        const dataset = widget.type === 'chart' ? datasetsById.get(widget.datasetId) : null;
                        const isExpanded = expandedWidgets.has(widget.id);
                        const effectiveSize = isExpanded ? 'xl' : (widget.size || 'md');
                        const title = widget.title || metric?.title || dataset?.title || 'Dash indisponível';
                        const icon = metric?.icon || dataset?.icon || 'fa-chart-simple';

                        return (
                            <article
                                key={widget.id}
                                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
                                onDragEnter={() => { if (draggingId && draggingId !== widget.id) setDragOverId(widget.id); }}
                                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragOverId(null); }}
                                onDrop={(event) => { event.preventDefault(); handleDrop(widget.id, draggingId || event.dataTransfer.getData('text/plain')); }}
                                onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}
                                onWheel={(event) => handleWheelResize(event, widget.id)}
                                className={`dashboard-widget widget-${effectiveSize} ${widget.type === 'metric' ? 'metric-widget' : 'chart-widget'} ${editMode ? 'is-editing' : ''} ${draggingId === widget.id ? 'is-dragging' : ''} ${dragOverId === widget.id ? 'is-drag-over' : ''}`}
                            >
                                <div className="widget-header">
                                    <div>
                                        <h3><i className={`fas ${icon}`}></i> {title}</h3>
                                        {widget.type === 'chart' && dataset?.description && <p>{dataset.description}</p>}
                                    </div>

                                    <div className="widget-actions">
                                        <span className="drag-handle" draggable title="Arrastar card" aria-label="Arrastar card" onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', widget.id); setDraggingId(widget.id); }} onDragEnd={() => { setDraggingId(null); setDragOverId(null); }}><i className="fas fa-grip-vertical"></i></span>
                                        <button type="button" className="icon-button" onClick={() => resizeWidget(widget.id, -1)} disabled={SIZE_STEPS.indexOf(effectiveSize) <= 0} title="Diminuir dash"><i className="fas fa-compress"></i></button>
                                        <button type="button" className="icon-button" onClick={() => resizeWidget(widget.id, 1)} disabled={SIZE_STEPS.indexOf(effectiveSize) >= SIZE_STEPS.length - 1} title="Aumentar dash"><i className="fas fa-expand"></i></button>
                                        <button type="button" className="icon-button danger" onClick={() => removeWidget(widget.id)} title="Remover"><i className="fas fa-trash"></i></button>
                                    </div>
                                </div>

                                {editMode && (
                                    <div className="widget-config">
                                        {widget.type === 'chart' && dataset && (
                                            <select className="form-control" value={widget.chartType || dataset.defaultChart || 'bar'} onChange={(event) => updateWidget(widget.id, { chartType: event.target.value })} aria-label="Tipo de gráfico">
                                                {chartTypesFor(dataset).map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}
                                            </select>
                                        )}
                                        <select className="form-control" value={effectiveSize} onChange={(event) => updateWidget(widget.id, { size: event.target.value })} aria-label="Tamanho">
                                            {(builder.sizes || DEFAULT_BUILDER.sizes).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                                        </select>
                                    </div>
                                )}

                                {widget.type === 'metric' ? (
                                    metric ? (
                                        <div className={`metric-content tone-${metric.tone || 'primary'}`}>
                                            <span className="metric-value">{formatNumber(metric.value)}{metric.suffix || ''}</span>
                                            <span className="metric-label">{metric.title}</span>
                                            {formatMetricComparison(metric) && (
                                                <span className={`metric-compare ${Number(metric.delta || 0) >= 0 ? 'is-up' : 'is-down'}`}>
                                                    <i className={`fas ${Number(metric.delta || 0) >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}`}></i>
                                                    {formatMetricComparison(metric)}
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="chart-state compact"><p>Indicador indisponível</p></div>
                                    )
                                ) : (
                                    <div className="chart-container builder-chart-container">
                                        {dataset ? renderChart(widget, dataset) : <div className="chart-state"><p>Gráfico indisponível</p></div>}
                                    </div>
                                )}

                                <div className="widget-bottom-bar">
                                    <button
                                        type="button"
                                        className="widget-expand-btn"
                                        onClick={() => toggleExpand(widget.id)}
                                        title={isExpanded ? 'Recolher' : 'Expandir'}
                                        aria-label={isExpanded ? 'Recolher card' : 'Expandir card'}
                                    >
                                        <i className={`fas ${isExpanded ? 'fa-compress' : 'fa-expand-arrows-alt'}`}></i>
                                        <span>{isExpanded ? 'Recolher' : 'Expandir'}</span>
                                    </button>
                                </div>

                                <div
                                    className="widget-resize-handle"
                                    onMouseDown={(e) => startFreeResize(e, widget.id)}
                                    title="Arrastar para redimensionar"
                                    aria-label="Redimensionar card"
                                >
                                    <i className="fas fa-up-right-and-down-left-from-center"></i>
                                </div>
                            </article>
                        );
                    })}
                </section>

                <div className="table-card">
                    <div className="table-header">
                        <h3 className="table-title"><i className="fas fa-history"></i> Últimas Inspeções</h3>
                    </div>
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Tipo</th>
                                    <th>Código SAP</th>
                                    <th>Modelo</th>
                                    <th>Linha</th>
                                    <th>Data</th>
                                    <th>Status</th>
                                    <th>Inspetor</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan="9"><div className="loading"><div className="loading-spinner"></div><p>Carregando inspeções...</p></div></td>
                                    </tr>
                                ) : registros.length === 0 ? (
                                    <tr>
                                        <td colSpan="9" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>Nenhuma inspeção encontrada</td>
                                    </tr>
                                ) : (
                                    registros.map((reg) => (
                                        <tr key={reg.key || `${reg.tipo}-${reg.id}`}>
                                            <td>{reg.id}</td>
                                            <td>{reg.tipo || 'N/A'}</td>
                                            <td><strong>{reg.cod_sap || 'N/A'}</strong></td>
                                            <td>{reg.modelo || reg.descricao_sap || 'N/A'}</td>
                                            <td>{reg.linha || reg.linha_montagem || '--'}</td>
                                            <td>{formatarData(reg.data_inspecao)}</td>
                                            <td><span className={`badge ${getStatusClass(reg.status)}`}>{getStatusTexto(reg.status)}</span></td>
                                            <td>{reg.inspetor || 'N/A'}</td>
                                            <td><Link to={reg.detail_url || '/registros/montagem'} className="btn-link">Ver detalhes</Link></td>
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