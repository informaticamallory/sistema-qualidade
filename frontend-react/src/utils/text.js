export const toUpper = (val) =>
    typeof val === 'string' ? val.toUpperCase() : val;

export const upperFields = (data, fields) => {
    const normalized = { ...data };

    fields.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(normalized, field)) {
            normalized[field] = toUpper(normalized[field]);
        }
    });

    return normalized;
};