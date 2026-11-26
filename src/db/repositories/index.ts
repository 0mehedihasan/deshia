/**
 * Repository barrel. Features and server actions import data access ONLY from
 * here — never raw Drizzle/SQL in components (see .claude/CLAUDE.md §6).
 */
export * as workspaceRepo from './workspaces';
export * as imageRepo from './images';
export * as annotationRepo from './annotations';
export * as eventRepo from './events';
export * as exportJobRepo from './export-jobs';
export * as analyticsRepo from './analytics';
export * as objectRepo from './objects';
export * as schemaRepo from './schemas';
export * as userRepo from './users';
export { newId } from './ids';
