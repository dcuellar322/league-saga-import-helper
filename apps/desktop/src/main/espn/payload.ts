export const ESPN_IMPORT_METADATA_KEY = '__leagueSagaImportHelper';

export type EspnImportMetadata = {
  transactionHistoryAvailable: boolean;
  transactionPeriodsRequested: number;
  transactionPeriodsSupported: number;
};
