export interface ReadinessProbe {
  check(): Promise<void>;
}

export interface ReadinessService {
  check(): Promise<ReadinessStatus>;
}

export type ReadinessStatus = "ready" | "not_ready";

export interface ReadinessResponse {
  status: ReadinessStatus;
}
