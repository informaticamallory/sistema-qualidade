const TURNOS_LEGADOS = {
    2: 'C'
};

export const normalizarTurno = (turno) => {
    const valor = String(turno ?? '').trim().toUpperCase();
    if (!valor) return '';

    return TURNOS_LEGADOS[valor] || valor;
};

export const formatarTurno = (turno, fallback = '-') => {
    const turnoNormalizado = normalizarTurno(turno);
    return turnoNormalizado ? `Turno ${turnoNormalizado}` : fallback;
};
