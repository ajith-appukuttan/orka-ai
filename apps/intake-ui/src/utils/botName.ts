/**
 * Map workspace status to the bot's display name.
 */
export function getBotName(workspaceStatus?: string): string {
  switch (workspaceStatus) {
    case 'ELABORATING':
      return 'Virtual Elaborator';
    case 'PLANNING':
      return 'Virtual Planner';
    case 'BUILDING':
      return 'Virtual Builder';
    case 'BUILT':
      return 'Virtual Builder';
    case 'CLASSIFYING':
      return 'Virtual Classifier';
    case 'FAILED':
      return 'Virtual Builder';
    default:
      return 'Virtual PM';
  }
}

/**
 * Get the avatar letter for the bot based on phase.
 */
export function getBotAvatarLetter(workspaceStatus?: string): string {
  switch (workspaceStatus) {
    case 'ELABORATING':
      return 'E';
    case 'PLANNING':
      return 'P';
    case 'BUILDING':
    case 'BUILT':
    case 'FAILED':
      return 'B';
    case 'CLASSIFYING':
      return 'C';
    default:
      return 'V';
  }
}
