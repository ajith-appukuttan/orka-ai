/**
 * Map workspace status to the bot's display name with emoji.
 */
export function getBotName(workspaceStatus?: string): string {
  switch (workspaceStatus) {
    case 'ELABORATING':
      return '🔍 Virtual Elaborator';
    case 'PLANNING':
      return '📋 Virtual Planner';
    case 'BUILDING':
      return '🔨 Virtual Builder';
    case 'BUILT':
      return '🔨 Virtual Builder';
    case 'CLASSIFYING':
      return '⚖️ Virtual Classifier';
    case 'FAILED':
      return '🔨 Virtual Builder';
    default:
      return '📝 Virtual PM';
  }
}

/**
 * Get the avatar letter/emoji for the bot based on phase.
 */
export function getBotAvatarLetter(workspaceStatus?: string): string {
  switch (workspaceStatus) {
    case 'ELABORATING':
      return '🔍';
    case 'PLANNING':
      return '📋';
    case 'BUILDING':
    case 'BUILT':
    case 'FAILED':
      return '⚒';
    case 'CLASSIFYING':
      return '⚖';
    default:
      return '📝';
  }
}
