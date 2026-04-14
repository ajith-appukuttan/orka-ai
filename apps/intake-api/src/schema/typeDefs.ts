export const typeDefs = `#graphql
  scalar DateTime
  scalar JSON

  # ─── Workspace ───────────────────────────────────────────
  type IntakeWorkspace {
    id: ID!
    tenantId: String!
    title: String!
    status: WorkspaceStatus!
    latestDraftId: ID
    latestSummaryId: ID
    repoUrl: String
    repoProvider: String
    repoDefaultBranch: String
    repoStatus: String
    createdBy: String!
    createdAt: DateTime!
    updatedAt: DateTime!
    # Resolved fields
    sessions: [IntakeSession!]!
    latestDraft: IntakeDraftVersion
    readinessScore: Float
    repoAnalysis: RepositoryAnalysis
  }

  enum WorkspaceStatus {
    ACTIVE
    REVIEWING
    APPROVED
    ARCHIVED
  }

  # ─── Repository Analysis ────────────────────────────────
  type RepositoryAnalysis {
    id: ID!
    repoUrl: String!
    status: String!
    readmeSummary: String
    techStack: JSON!
    keyComponents: JSON!
    architectureNotes: String
    entryPoints: JSON!
    analyzedAt: DateTime
    createdAt: DateTime!
  }

  type CodeTarget {
    id: ID!
    filePath: String!
    symbolName: String
    matchReason: String
    confidence: Float!
  }

  type CodeTargetMapping {
    requirementId: ID!
    codeTargets: [CodeTarget!]!
  }

  # ─── Session ────────────────────────────────────────────
  type IntakeSession {
    id: ID!
    intakeWorkspaceId: ID!
    projectId: ID
    tenantId: String
    userId: String!
    title: String!
    status: SessionStatus!
    readinessScore: Float
    createdAt: DateTime!
    updatedAt: DateTime!
    # Resolved fields
    messages: [IntakeMessage!]
  }

  enum SessionStatus {
    ACTIVE
    REVIEWING
    APPROVED
    ARCHIVED
  }

  # ─── Message ────────────────────────────────────────────
  type IntakeMessage {
    id: ID!
    sessionId: ID!
    role: MessageRole!
    content: String!
    toolCalls: JSON
    createdAt: DateTime!
  }

  enum MessageRole {
    user
    assistant
    system
  }

  # ─── Draft Version ─────────────────────────────────────
  type IntakeDraftVersion {
    id: ID!
    intakeWorkspaceId: ID!
    version: Int!
    draftJson: JSON!
    readinessScore: Float!
    readyForReview: Boolean!
    createdAt: DateTime!
  }

  # ─── Legacy Draft (kept for backward compat) ───────────
  type IntakeDraft {
    id: ID!
    sessionId: ID!
    version: Int!
    draft: JSON!
    readinessScore: Float!
    createdAt: DateTime!
  }

  # ─── Memory Item ───────────────────────────────────────
  type IntakeMemoryItem {
    id: ID!
    intakeWorkspaceId: ID!
    kind: String!
    key: String!
    value: String!
    source: String!
    confidence: Float!
    status: String!
    createdAt: DateTime!
  }

  # ─── Workspace Summary ────────────────────────────────
  type WorkspaceSummary {
    id: ID!
    intakeWorkspaceId: ID!
    summaryText: String!
    generatedFromMessageId: ID
    createdAt: DateTime!
  }

  # ─── Approved Artifact ────────────────────────────────
  type ApprovedArtifact {
    id: ID!
    tenantId: String
    workspaceId: ID
    runId: String!
    stage: String!
    artifactType: String!
    version: Int!
    bucketName: String!
    objectKey: String!
    checksum: String!
    approvedBy: String!
    approvedAt: DateTime!
    status: String!
    downloadUrl: String
  }

  # ─── Search Result ────────────────────────────────────
  type SearchResult {
    workspaceId: ID!
    workspaceTitle: String!
    sessionId: ID
    sessionTitle: String
    matchType: String!
    matchText: String!
    createdAt: DateTime!
  }

  # ─── Visual Intake ──────────────────────────────────────
  type VisualPreviewSession {
    id: ID!
    intakeWorkspaceId: ID!
    url: String!
    status: String!
    browserLaunched: Boolean
    createdAt: DateTime!
  }

  type VisualSelection {
    id: ID!
    sessionId: ID!
    selector: String!
    domPath: String
    textContent: String
    boundingBox: JSON!
    ariaRole: String
    screenshotRef: String
    elementScreenshot: String
    pageUrl: String!
    createdAt: DateTime!
  }

  type VisualRequirement {
    id: ID!
    intakeWorkspaceId: ID
    selectionId: ID
    title: String!
    summary: String!
    userGoal: String!
    targetArea: String!
    requestedChange: String!
    changeCategory: String
    acceptanceCriteria: JSON!
    implementationHints: JSON!
    openQuestions: JSON!
    confidence: Float!
    status: String!
    createdAt: DateTime
  }

  type ScreenshotResult {
    selectionId: ID!
    objectKey: String!
    downloadUrl: String
  }

  # ─── Intake Readiness Classification ──────────────────
  type IntakeClassification {
    id: ID!
    runId: String!
    approvedArtifactId: ID!
    classification: String!
    buildReadinessScore: Float!
    reasoningSummary: String
    signals: JSON!
    requiredNextStages: [String!]!
    blockingQuestions: [String!]!
    confidence: Float!
    objectKey: String
    createdAt: DateTime!
  }

  type AggregatedPRD {
    title: String!
    summary: String!
    businessGoals: [String!]!
    userStories: [String!]!
    inScope: [String!]!
    outOfScope: [String!]!
    uiUxRequirements: JSON!
    nonFunctionalRequirements: [String!]!
    dependencies: [String!]!
    risks: [String!]!
    openQuestions: [String!]!
    successMetrics: [String!]!
    confidence: Float!
  }

  # ─── Streaming ─────────────────────────────────────────
  type StreamingChunk {
    sessionId: ID!
    content: String!
    done: Boolean!
  }

  # ═══════════════════════════════════════════════════════
  # Queries
  # ═══════════════════════════════════════════════════════
  type Query {
    # Workspace queries
    intakeWorkspaces(tenantId: String!): [IntakeWorkspace!]!
    intakeWorkspace(workspaceId: ID!): IntakeWorkspace

    # Session queries
    intakeSessions(workspaceId: ID!): [IntakeSession!]!
    intakeSession(sessionId: ID!): IntakeSession

    # Message queries
    intakeMessages(sessionId: ID!, limit: Int, offset: Int): [IntakeMessage!]!

    # Draft queries
    intakeLatestDraft(workspaceId: ID!): IntakeDraftVersion
    intakeDraft(sessionId: ID!): IntakeDraft

    # Memory queries
    intakeMemoryItems(workspaceId: ID!): [IntakeMemoryItem!]!

    # Repository queries
    repositoryAnalysis(workspaceId: ID!): RepositoryAnalysis
    codeTargetsForRequirement(requirementId: ID!): [CodeTarget!]!

    # Search
    # Classification queries
    intakeClassification(runId: String!): IntakeClassification
    intakeClassifications(workspaceId: ID!): [IntakeClassification!]!

    searchIntake(query: String!, tenantId: String!): [SearchResult!]!

    # Approved artifact queries
    approvedArtifacts(workspaceId: ID!): [ApprovedArtifact!]!
    approvedArtifact(id: ID!): ApprovedArtifact
    approvedArtifactsByRun(runId: String!): [ApprovedArtifact!]!

    # Visual Intake queries
    visualPreviewSession(id: ID!): VisualPreviewSession
    visualSelections(sessionId: ID!): [VisualSelection!]!
    visualRequirements(workspaceId: ID!): [VisualRequirement!]!
  }

  # ═══════════════════════════════════════════════════════
  # Mutations
  # ═══════════════════════════════════════════════════════
  type Mutation {
    # Workspace mutations
    createIntakeWorkspace(
      tenantId: String!
      title: String!
      createdBy: String!
    ): IntakeWorkspace!

    renameIntakeWorkspace(
      workspaceId: ID!
      title: String!
    ): IntakeWorkspace!

    archiveIntakeWorkspace(
      workspaceId: ID!
    ): IntakeWorkspace!

    # Session mutations
    startIntakeSession(
      workspaceId: ID!
      userId: String!
      title: String
    ): IntakeSession!

    # Legacy session start (backward compat)
    startLegacyIntakeSession(
      projectId: ID!
      tenantId: String!
      workspaceId: String!
      userId: String!
    ): IntakeSession!

    # Message mutations
    sendIntakeMessage(
      sessionId: ID!
      message: String!
    ): IntakeMessage!

    # Log a message without triggering Claude (visual inspect events, etc.)
    logIntakeMessage(
      sessionId: ID!
      role: String!
      content: String!
    ): IntakeMessage!

    # Draft mutations
    editIntakeDraft(
      sessionId: ID!
      patch: JSON!
    ): IntakeDraft!

    # Approval
    approveIntakeDraft(
      sessionId: ID!
      approvedBy: String!
    ): ApprovedArtifact!

    # Session lifecycle
    archiveIntakeSession(
      sessionId: ID!
    ): IntakeSession!

    # Memory mutations
    promoteMemoryItem(
      workspaceId: ID!
      kind: String!
      key: String!
      value: String!
      source: String
    ): IntakeMemoryItem!

    archiveMemoryItem(
      itemId: ID!
    ): IntakeMemoryItem!

    # Visual Intake mutations
    startVisualIntakeSession(
      workspaceId: ID!
      url: String!
    ): VisualPreviewSession!

    selectVisualElement(
      sessionId: ID!
      x: Float!
      y: Float!
    ): VisualSelection!

    saveVisualSelection(
      sessionId: ID!
      selector: String!
      domPath: String
      textContent: String
      boundingBox: JSON!
      ariaRole: String
      screenshotRef: String
      pageUrl: String!
    ): VisualSelection!

    submitVisualChange(
      sessionId: ID!
      selectionId: ID!
      instruction: String!
    ): VisualRequirement!

    addVisualRequirementToDraft(
      workspaceId: ID!
      requirementId: ID!
    ): VisualRequirement!

    saveVisualScreenshot(
      selectionId: ID!
      screenshotBase64: String!
    ): ScreenshotResult!

    closeVisualSession(
      sessionId: ID!
    ): VisualPreviewSession!

    updateVisualRequirement(
      requirementId: ID!
      patch: JSON!
    ): VisualRequirement!

    archiveVisualRequirement(
      requirementId: ID!
    ): VisualRequirement!

    bulkAcceptVisualRequirements(
      workspaceId: ID!
      requirementIds: [ID!]!
    ): [VisualRequirement!]!

    generateVisualPRD(
      workspaceId: ID!
    ): AggregatedPRD!

    # Repository analysis mutations
    analyzeRepository(
      workspaceId: ID!
      repoUrl: String!
      branch: String
    ): RepositoryAnalysis!

    mapRequirementsToCode(
      workspaceId: ID!
      requirementIds: [ID!]
    ): [CodeTargetMapping!]!
  }

  # ═══════════════════════════════════════════════════════
  # Subscriptions
  # ═══════════════════════════════════════════════════════
  type Subscription {
    intakeMessageStream(sessionId: ID!): IntakeMessage!
    intakeStreamingChunk(sessionId: ID!): StreamingChunk!
    intakeDraftUpdated(workspaceId: ID!): IntakeDraftVersion!
    intakeReadinessUpdated(workspaceId: ID!): Float!
    intakeMemoryUpdated(workspaceId: ID!): IntakeMemoryItem!
    visualRequirementGenerated(workspaceId: ID!): VisualRequirement!
    visualRequirementUpdated(workspaceId: ID!): VisualRequirement!
  }
`;
