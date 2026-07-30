import { describe, it, expect } from 'vitest';
import { senhaValida, avaliarSenha } from '../passwordValidation';

describe('senhaValida', () => {
    it('aceita uma senha que atende a todos os critérios', () => {
        expect(senhaValida('Abc12345!')).toBe(true);
    });

    it('rejeita senha sem letra maiúscula', () => {
        expect(senhaValida('abc12345!')).toBe(false);
    });

    it('rejeita senha sem letra minúscula', () => {
        expect(senhaValida('ABC12345!')).toBe(false);
    });

    it('rejeita senha sem número', () => {
        expect(senhaValida('Abcdefgh!')).toBe(false);
    });

    it('rejeita senha sem caractere especial', () => {
        expect(senhaValida('Abc123456')).toBe(false);
    });

    it('rejeita senha com tamanho incorreto (menor que 8)', () => {
        expect(senhaValida('Ab1!')).toBe(false);
    });
});

describe('avaliarSenha', () => {
    it('marca cada critério individualmente conforme o usuário digita', () => {
        const criterios = avaliarSenha('Abc12345!');
        expect(criterios.every((c) => c.atendido)).toBe(true);
    });

    it('reporta apenas o critério de maiúscula como pendente', () => {
        const criterios = avaliarSenha('abc12345!');
        const maiuscula = criterios.find((c) => c.chave === 'maiuscula');
        expect(maiuscula.atendido).toBe(false);
        expect(criterios.filter((c) => !c.atendido)).toHaveLength(1);
    });
});
