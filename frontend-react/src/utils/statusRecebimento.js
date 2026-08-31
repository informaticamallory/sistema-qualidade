/* Status da Ficha de Inspeção de Recebimento.
   O parecer não é escolhido à mão: vem dos pareceres NC (não conforme) e SC
   (sob concessão) lançados em Lotes/Entrada.

   Regra, por linha de lote:
     NC > 0            -> reprovado
     NC = 0 e SC > 0   -> concessao   (Aprovado sob Concessão)
     NC = 0 e SC = 0   -> aprovado

   Fica num utilitário próprio porque a lógica é consumida tanto pela página de
   Recebimento quanto pela de Indicadores — e porque exportar funções de um
   arquivo de componente quebra o fast refresh do Vite. */

/* Pareceres chegam como texto do formulário e podem vir com vírgula decimal;
   vazio ou inválido conta como zero. Continua exportado porque os lotes
   antigos ainda guardam esses números. */
export const numeroParecer = (valor) => {
    const n = Number(String(valor ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};

/* Opções do campo Resultado, que substituiu as três colunas C / SC / NC. */
export const RESULTADOS_LOTE = [
    { valor: 'conforme', label: 'Conforme' },
    { valor: 'nao_conforme', label: 'Não Conforme' },
    { valor: 'concessao', label: 'Sob Concessão' }
];

const STATUS_POR_RESULTADO = {
    conforme: 'aprovado',
    nao_conforme: 'reprovado',
    concessao: 'concessao'
};

/* Valor a exibir no select. Lote antigo não tem `resultado`, então o valor é
   derivado das quantidades que ele guarda — assim a ficha abre já mostrando a
   classificação correta em vez de cair no primeiro item da lista. */
export const resultadoDoLote = (lote) => {
    const resultado = String(lote?.resultado || '').trim();
    if (resultado && STATUS_POR_RESULTADO[resultado]) return resultado;

    if (numeroParecer(lote?.parecer_nc) > 0) return 'nao_conforme';
    if (numeroParecer(lote?.parecer_sc) > 0) return 'concessao';
    return 'conforme';
};

/* Lê o campo único `resultado`. Lotes gravados antes dessa mudança não têm
   esse campo — para eles vale a regra anterior, baseada nas quantidades de NC
   e SC, senão todo o histórico perderia a classificação. */
export const statusDoLote = (lote) => STATUS_POR_RESULTADO[resultadoDoLote(lote)];

/* O pior parecer entre os lotes manda no status da ficha: NC em qualquer lote
   reprova; sem NC, um SC coloca a ficha sob concessão. */
export const calcularStatusFicha = (lotes) => {
    const linhas = Array.isArray(lotes) ? lotes : [];
    if (linhas.some((lote) => statusDoLote(lote) === 'reprovado')) return 'reprovado';
    if (linhas.some((lote) => statusDoLote(lote) === 'concessao')) return 'concessao';
    return 'aprovado';
};

/* Valor gravado é 'concessao', não "Aprovado sob Concessão": a coluna status é
   VARCHAR(20) e o rótulo tem 22 caracteres, seria truncado. 'concessao' também
   é a chave que o resto do sistema já usa (getStatusClass da Injeção mapeia
   'concessao' para badge-info). */
export const LABEL_STATUS = {
    aprovado: 'Aprovado',
    concessao: 'Aprovado sob Concessão',
    reprovado: 'Reprovado',
    pendente: 'Pendente'
};
