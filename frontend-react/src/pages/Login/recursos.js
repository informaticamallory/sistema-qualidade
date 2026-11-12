import wordmark from './mallory-wordmark.png';
import arte from './tela-login.webp';

/* Arquivos de imagem da tela de login.

   LOGOTIPO — presente
   -------------------
   `mallory-logo.png` é o arquivo oficial enviado, com uma única alteração:
   a linha de 1px cinza (#404040) que vinha no topo, sobra do recorte, foi
   removida. Nada mais foi tocado — letras, proporção e cores são os do
   original.

   Três características dele mandam no código desta tela:

     1. O fundo laranja é CHAPADO, não transparente. Então o logotipo só
        pode ser usado sobre laranja; sobre o branco do cartão ele aparece
        como um bloco, não como letras soltas.
     2. Esse laranja é #F16425, e não o #FF6600 institucional dos tokens.
        Por isso a faixa inclinada atrás dele usa --login-laranja-logo: se
        usasse o laranja do sistema, a emenda entre a faixa e o retângulo
        do arquivo ficaria visível.
     3. São 378x76 px. Dá conta de exibir até uns 48px de altura; acima
        disso, ou numa tela de alta densidade, o traço começa a borrar.

   Um SVG, ou um PNG com fundo transparente, resolveria os três de uma vez
   — e aí o rodapé do cartão poderia ter o wordmark laranja sobre branco,
   como na referência, em vez da placa laranja que está lá hoje.

   FOTOGRAFIA — ainda falta
   ------------------------
   A fotografia industrial do painel esquerdo (prancheta, checklist, mão
   conferindo) ainda não chegou. Sem ela a ilha escura fica só com o
   gradiente. Para ligar, basta:

       import foto from './chao-de-fabrica.webp';
       export const fotoIndustrial = foto;

   WebP ou JPG, 1600x1200 no mínimo, orientação retrato ou quadrada. Ela
   fica sob um véu escuro, então imagem clara e com bastante contraste
   rende melhor. Acima de 400 KB vale comprimir antes: é o primeiro arquivo
   que todo usuário baixa, toda manhã. */

/* `mallory-wordmark.png` é a palavra MALLORY recortada do arquivo acima,
   sem a assinatura "dedicados a ser sua marca favorita" nem o coração.
   Dois motivos:

     - a referência mostra só a palavra na faixa do topo, sem a assinatura;
     - na altura em que a faixa cabe, a assinatura fica com menos de 8px de
       altura e vira borrão. Exibir ilegível é pior do que não exibir.

   O recorte é só corte, sem redesenho: 205x41, bordas em laranja puro.

   `mallory-logo.png`, o arquivo completo, fica na pasta mas NÃO é importado
   de propósito: importar sem usar colocaria 9 KB no pacote que ninguém
   baixa para ver. Quando aparecer um lugar que comporte a assinatura
   inteira, é só importá-lo aqui. */
export const logoMallory = wordmark;

/* A arte da tela inteira, usada como fundo.

   Decisão do cliente: em vez de redesenhar a composição em SVG, a imagem
   entra inteira e só o cartão de acesso é construído em componente, por
   cima do cartão que já está desenhado nela.

   As medidas abaixo são do cartão DENTRO da arte, em pixels da imagem de
   1671x941. O CSS as usa em porcentagem para colar o cartão real exatamente
   sobre o desenhado, em qualquer tamanho de tela. Se a arte for trocada,
   estes quatro números têm de ser medidos de novo — é a única amarra entre
   a imagem e o código. */
export const arteLogin = arte;

export const ARTE = {
    largura: 1671,
    altura: 941,
    cartao: { esquerda: 1045, direita: 1646, topo: 108, base: 848 }
};

export const fotoIndustrial = null;

/* O laranja do próprio arquivo do logotipo. Publicado aqui para o CSS não
   repetir o valor solto. */
export const LARANJA_DO_LOGO = '#f16425';
