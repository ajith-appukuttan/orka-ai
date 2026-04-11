export type SessionStatus = 'ACTIVE' | 'REVIEWING' | 'APPROVED' | 'ARCHIVED';

export interface IntakeSession {
  id: string;
  projectId: string;
  tenantId: string;
  workspaceId: string;
  userId: string;
  status: SessionStatus;
  readinessScore: number;
  createdAt: Date;
  updatedAt: Date;
}
