-- A3 (1/2): operador de plataforma. Va en su propia migración porque PostgreSQL no permite usar un valor
-- de enum recién agregado dentro de la misma transacción (lo usa el CHECK de la migración siguiente).
ALTER TYPE "AccountType" ADD VALUE 'PLATFORM';
