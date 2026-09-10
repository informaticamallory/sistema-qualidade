/* Mallory UI Kit — ponto único de importação.

   Uso:  import { Button, Badge, KpiCard, Input, Select, Tabs, DataTable }
           from '../../components/ui';

   Todos consomem exclusivamente os tokens de styles/tokens.css e as classes
   de ui/theme/ui-kit.css. Nenhum tem cor ou espaçamento em valor literal, de
   modo que tema (data-theme) e densidade (data-density) se aplicam sozinhos. */

export { default as Button } from './Button';
export { default as Badge } from './Badge';
export { default as KpiCard } from './KpiCard';
export { default as Tabs } from './Tabs';
export { default as ConfirmarSaida } from './ConfirmarSaida';
export { default as MobileActionSheet } from './MobileActionSheet';
export { default as DataTable } from './DataTable';
export { default as Input, Input as TextInput, Select } from './Field';
