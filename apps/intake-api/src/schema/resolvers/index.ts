import { workspaceResolvers } from './workspace.js';
import { sessionResolvers } from './session.js';
import { messageResolvers } from './message.js';
import { draftResolvers } from './draft.js';
import { approvalResolvers } from './approval.js';
import { artifactResolvers } from './artifacts.js';
import { memoryResolvers } from './memory.js';
import { visualResolvers } from './visual.js';
import { repoResolvers } from './repo.js';
import { classificationResolvers } from './classification.js';

export const resolvers = {
  Query: {
    ...workspaceResolvers.Query,
    ...sessionResolvers.Query,
    ...messageResolvers.Query,
    ...draftResolvers.Query,
    ...memoryResolvers.Query,
    ...visualResolvers.Query,
    ...artifactResolvers.Query,
    ...repoResolvers.Query,
    ...classificationResolvers.Query,
  },
  Mutation: {
    ...workspaceResolvers.Mutation,
    ...sessionResolvers.Mutation,
    ...messageResolvers.Mutation,
    ...draftResolvers.Mutation,
    ...approvalResolvers.Mutation,
    ...memoryResolvers.Mutation,
    ...visualResolvers.Mutation,
    ...repoResolvers.Mutation,
  },
  Subscription: {
    ...messageResolvers.Subscription,
    ...draftResolvers.Subscription,
    ...memoryResolvers.Subscription,
    ...visualResolvers.Subscription,
  },
  // Type resolvers
  IntakeWorkspace: {
    ...workspaceResolvers.IntakeWorkspace,
    ...repoResolvers.IntakeWorkspace,
    ...classificationResolvers.IntakeWorkspace,
  },
  IntakeSession: sessionResolvers.IntakeSession,
};
