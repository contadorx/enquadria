/**
 * CNPJ — normalização e validação.
 * O dígito verificador barra lixo de digitação antes de gastar uma consulta
 * à Receita ou uma linha no banco.
 */
export function soDigitos(v) {
    return (v || "").replace(/\D/g, "");
}
export function normalizarCnpj(v) {
    return soDigitos(v).padStart(14, "0").slice(-14);
}
export function formatarCnpj(v) {
    const d = normalizarCnpj(v);
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
/** máscara que preserva a raiz e esconde o miolo, como no mockup */
export function mascararCnpj(v) {
    const d = normalizarCnpj(v);
    return `${d.slice(0, 2)}.***.***/${d.slice(8, 12)}-${d.slice(12)}`;
}
export function cnpjValido(v) {
    const c = soDigitos(v);
    if (c.length !== 14)
        return false;
    if (/^(\d)\1{13}$/.test(c))
        return false;
    const calc = (base) => {
        let soma = 0;
        let peso = base.length - 7;
        for (let i = 0; i < base.length; i++) {
            soma += parseInt(base[i], 10) * peso;
            peso = peso === 2 ? 9 : peso - 1;
        }
        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    };
    const dv1 = calc(c.slice(0, 12));
    const dv2 = calc(c.slice(0, 12) + dv1);
    return c.slice(12) === `${dv1}${dv2}`;
}
