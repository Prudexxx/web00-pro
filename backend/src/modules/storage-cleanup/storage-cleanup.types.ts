export type StorageCleanupJobStatus =
  | "completed"
  | "failed"
  | "pending"
  | "processing";

export interface StorageCleanupJobRecord {
  attempts: number;
  completedAt: Date | null;
  entityId: string | null;
  entityType: string | null;
  id: string;
  lastError: string | null;
  reason: string;
  runAfter: Date;
  status: StorageCleanupJobStatus;
  storagePath: string;
  updatedAt: Date;
}

export interface CreateStorageCleanupJobInput {
  entityId: string | null;
  entityType: string | null;
  reason: string;
  runAfter: Date;
  storagePath: string;
}

export interface CreateUploadReservationInput {
  entityId: string;
  paths: string[];
  runAfter: Date;
}

export interface MarkUploadReservationsCompletedInput {
  completedAt: Date;
  reservationIds: string[];
}

export interface ClaimStorageCleanupJobsInput {
  limit: number;
  now: Date;
}

export interface MarkStorageCleanupJobCompletedInput {
  completedAt: Date;
  id: string;
}

export interface MarkStorageCleanupJobFailedInput {
  id: string;
  lastError: string;
  nextRunAfter: Date | null;
}

export interface RecoverStaleProcessingInput {
  olderThan: Date;
}

export interface StorageCleanupRepository {
  claimDueJobs(input: ClaimStorageCleanupJobsInput): Promise<StorageCleanupJobRecord[]>;
  createJobs(input: CreateStorageCleanupJobInput[]): Promise<void>;
  createUploadReservations(
    input: CreateUploadReservationInput
  ): Promise<StorageCleanupJobRecord[]>;
  markCompleted(input: MarkStorageCleanupJobCompletedInput): Promise<void>;
  markFailed(input: MarkStorageCleanupJobFailedInput): Promise<void>;
  markUploadReservationsCompleted(
    input: MarkUploadReservationsCompletedInput
  ): Promise<void>;
  recoverStaleProcessing(input: RecoverStaleProcessingInput): Promise<number>;
}

export interface StorageCleanupTickResult {
  claimed: number;
  completed: number;
  failed: number;
  recovered: number;
}

export interface StorageCleanupWorker {
  start(): void;
  stop(): Promise<void>;
  tick(): Promise<StorageCleanupTickResult>;
}
