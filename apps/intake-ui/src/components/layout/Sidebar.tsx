import { useState } from 'react';
import {
  Stack,
  Text,
  NavLink,
  ActionIcon,
  Group,
  TextInput,
  ScrollArea,
  Box,
  Tooltip,
  Badge,
  Loader,
} from '@mantine/core';
import { useTheme } from '../../hooks/useTheme';
import { ThemeToggle } from './ThemeToggle';

interface SidebarSession {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
}

interface SidebarClassification {
  classification: string;
  buildReadinessScore: number;
  runId: string;
}

interface SidebarWorkspace {
  id: string;
  title: string;
  status: string;
  readinessScore: number | null;
  statusChangedAt: string;
  updatedAt: string;
  sessions: SidebarSession[];
  latestClassification?: SidebarClassification | null;
}

interface SearchResult {
  workspaceId: string;
  workspaceTitle: string;
  sessionId: string | null;
  sessionTitle: string | null;
  matchType: string;
  matchText: string;
}

interface SidebarProps {
  workspaces: SidebarWorkspace[];
  loading: boolean;
  activeSessionId?: string;
  activeWorkspaceId?: string;
  onSelectSession: (workspaceId: string, sessionId: string) => void;
  onNewWorkspace: () => void;
  onNewSession: (workspaceId: string) => void;
  onClearSession?: () => void;
  onArchiveSession?: (sessionId: string) => void;
  onArchiveWorkspace?: (workspaceId: string) => void;
  searchResults?: SearchResult[];
  searchLoading?: boolean;
  onSearch?: (query: string) => void;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

export function Sidebar({
  workspaces,
  loading,
  activeSessionId,
  activeWorkspaceId,
  onSelectSession,
  onNewWorkspace,
  onNewSession,
  onClearSession,
  onArchiveSession,
  onArchiveWorkspace,
  searchResults,
  searchLoading,
  onSearch,
}: SidebarProps) {
  const [expandedWorkspaces, setExpandedWorkspaces] = useState<Set<string>>(
    new Set(activeWorkspaceId ? [activeWorkspaceId] : []),
  );
  const [searchQuery, setSearchQuery] = useState('');
  const { themedColor } = useTheme();

  const isSearching = searchQuery.length > 0;

  const toggleWorkspace = (id: string) => {
    setExpandedWorkspaces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    onSearch?.(value);
  };

  return (
    <Stack h="100%" gap={0}>
      {/* Branding */}
      <Box
        px="sm"
        py="xs"
        style={{
          borderBottom: `1px solid ${themedColor('borderColor')}`,
          background: themedColor('sidebarHeaderBg'),
        }}
      >
        <Group justify="space-between" align="center" mb={8}>
          <Group gap="xs">
            <Box
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${themedColor('accentGreenGradientFrom')} 0%, ${themedColor('accentGreenGradientTo')} 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 10,
                fontWeight: 700,
              }}
            >
              V
            </Box>
            <Text size="sm" fw={600}>
              Virtual PM
            </Text>
          </Group>
          <Group gap={4}>
            <ThemeToggle />
            <Tooltip label="New workspace">
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={onNewWorkspace}>
                +
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {/* Search input */}
        <TextInput
          size="xs"
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.currentTarget.value)}
          rightSection={
            searchQuery ? (
              <ActionIcon size="xs" variant="subtle" onClick={() => handleSearchChange('')}>
                x
              </ActionIcon>
            ) : undefined
          }
          styles={{
            input: { fontSize: 12 },
          }}
        />
      </Box>

      {/* Content */}
      <ScrollArea flex={1} scrollbarSize={4}>
        {loading && (
          <Stack align="center" py="xl">
            <Loader size="xs" type="dots" />
          </Stack>
        )}

        {/* Search results mode */}
        {isSearching && !loading && (
          <>
            {searchLoading && (
              <Stack align="center" py="md">
                <Loader size="xs" type="dots" />
              </Stack>
            )}
            {!searchLoading && searchResults && searchResults.length === 0 && (
              <Text size="xs" c="dimmed" ta="center" py="md" px="sm">
                No results for "{searchQuery}"
              </Text>
            )}
            {!searchLoading &&
              searchResults?.map((result, i) => (
                <NavLink
                  key={`${result.workspaceId}-${result.sessionId}-${i}`}
                  label={
                    <Group gap={4} wrap="nowrap">
                      <Badge size="xs" variant="outline" color="gray">
                        {result.matchType}
                      </Badge>
                      <Text size="xs" truncate>
                        {result.workspaceTitle}
                      </Text>
                    </Group>
                  }
                  description={
                    <Text size="xs" c="dimmed" lineClamp={2} style={{ fontSize: 10 }}>
                      {result.matchText}
                    </Text>
                  }
                  onClick={() => {
                    if (result.sessionId) {
                      onSelectSession(result.workspaceId, result.sessionId);
                    }
                  }}
                  variant="subtle"
                  styles={{
                    root: { borderRadius: 0, padding: '6px 12px' },
                  }}
                />
              ))}
          </>
        )}

        {/* Normal workspace tree mode */}
        {!isSearching && !loading && workspaces.length === 0 && (
          <Stack align="center" py="xl" px="sm">
            <Text size="xs" c="dimmed" ta="center">
              No workspaces yet. Click + to create one.
            </Text>
          </Stack>
        )}

        {!isSearching &&
          [...workspaces]
            .sort((a, b) => {
              // Active workspace always first
              if (a.id === activeWorkspaceId) return -1;
              if (b.id === activeWorkspaceId) return 1;
              return 0; // keep original order otherwise
            })
            .map((ws) => {
              const isExpanded = expandedWorkspaces.has(ws.id);
              const isActiveWs = ws.id === activeWorkspaceId;

              return (
                <Box
                  key={ws.id}
                  style={{
                    position: 'relative',
                    borderLeft: isActiveWs
                      ? `3px solid ${themedColor('accentGreen')}`
                      : '3px solid transparent',
                    background: isActiveWs ? themedColor('sidebarActiveBg') : 'transparent',
                    transition: 'all 150ms ease',
                  }}
                  className="workspace-item"
                >
                  <NavLink
                    label={
                      <Group gap={6} wrap="nowrap">
                        <Text
                          size="sm"
                          truncate
                          fw={isActiveWs ? 600 : 400}
                          style={{
                            flex: 1,
                            color: isActiveWs ? themedColor('sidebarTextActive') : undefined,
                          }}
                        >
                          {ws.title}
                        </Text>
                        {(() => {
                          const buildingMinutes =
                            ws.status === 'BUILDING' && ws.statusChangedAt
                              ? (Date.now() - new Date(ws.statusChangedAt).getTime()) / 60_000
                              : 0;
                          const isBuildStuck = ws.status === 'BUILDING' && buildingMinutes > 5;
                          const statusBadge: Record<string, { label: string; color: string }> = {
                            CLASSIFYING: { label: 'Classifying', color: 'yellow' },
                            ELABORATING: { label: 'Elaborating', color: 'yellow' },
                            PLANNING: { label: 'Planning', color: 'blue' },
                            BUILDING: isBuildStuck
                              ? { label: 'Stuck?', color: 'red' }
                              : { label: 'Building', color: 'teal' },
                            BUILT: { label: 'PR Ready', color: 'teal' },
                            FAILED: { label: 'Failed', color: 'red' },
                          };
                          const badge = statusBadge[ws.status];
                          if (badge) {
                            return (
                              <Badge
                                size="xs"
                                variant="filled"
                                color={badge.color}
                                styles={{ root: { fontSize: 9, textTransform: 'uppercase' } }}
                              >
                                {badge.label}
                              </Badge>
                            );
                          }
                          if (ws.latestClassification) {
                            const classMap: Record<string, { label: string; color: string }> = {
                              DIRECT_TO_BUILD: { label: 'Build', color: 'teal' },
                              NEEDS_ELABORATION: { label: 'Elaboration', color: 'yellow' },
                              NEEDS_PLANNING: { label: 'Planning', color: 'blue' },
                              NEEDS_ELABORATION_AND_PLANNING: {
                                label: 'Elab+Plan',
                                color: 'orange',
                              },
                              RETURN_TO_INTAKE: { label: 'Intake', color: 'red' },
                            };
                            const cls = classMap[ws.latestClassification.classification];
                            if (cls) {
                              return (
                                <Badge
                                  size="xs"
                                  variant="filled"
                                  color={cls.color}
                                  styles={{ root: { fontSize: 9, textTransform: 'uppercase' } }}
                                >
                                  {cls.label}
                                </Badge>
                              );
                            }
                          }
                          if (ws.readinessScore !== null && ws.readinessScore > 0) {
                            return (
                              <Badge
                                size="xs"
                                variant="dot"
                                color={ws.readinessScore >= 0.8 ? 'teal' : 'blue'}
                              >
                                {Math.round(ws.readinessScore * 100)}%
                              </Badge>
                            );
                          }
                          return null;
                        })()}
                      </Group>
                    }
                    description={formatTime(ws.updatedAt)}
                    opened={isExpanded}
                    onClick={() => {
                      toggleWorkspace(ws.id);
                      // If workspace has sessions, select the first one
                      if (ws.sessions.length > 0 && !isActiveWs) {
                        onSelectSession(ws.id, ws.sessions[0].id);
                      }
                    }}
                    active={false}
                    variant="subtle"
                    styles={{
                      root: { borderRadius: 0, padding: '6px 12px', paddingRight: 56 },
                      label: { fontSize: 13 },
                      description: { fontSize: 11 },
                    }}
                  >
                    {/* Workspace action buttons — always visible */}
                    <Group
                      gap={2}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: 8,
                      }}
                    >
                      <Tooltip label="New session">
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color="gray"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNewSession(ws.id);
                          }}
                        >
                          +
                        </ActionIcon>
                      </Tooltip>
                      {onArchiveWorkspace && (
                        <Tooltip label="Archive workspace">
                          <ActionIcon
                            size="xs"
                            variant="subtle"
                            color="gray"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (ws.id === activeWorkspaceId) {
                                onClearSession?.();
                              }
                              onArchiveWorkspace(ws.id);
                            }}
                          >
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>

                    {ws.sessions.map((session) => {
                      const isActiveSession = session.id === activeSessionId;
                      return (
                        <Box
                          key={session.id}
                          style={{
                            position: 'relative',
                            background: isActiveSession
                              ? themedColor('sidebarActiveBg')
                              : 'transparent',
                          }}
                          className="session-item"
                        >
                          <NavLink
                            label={
                              <Text
                                size="xs"
                                fw={isActiveSession ? 600 : 400}
                                style={{
                                  color: isActiveSession
                                    ? themedColor('sidebarTextActive')
                                    : undefined,
                                }}
                              >
                                {session.title}
                              </Text>
                            }
                            description={formatTime(session.updatedAt)}
                            active={false}
                            onClick={() => onSelectSession(ws.id, session.id)}
                            variant="subtle"
                            pl="lg"
                            styles={{
                              root: {
                                borderRadius: 0,
                                padding: '4px 12px 4px 28px',
                                paddingRight: 32,
                              },
                              description: { fontSize: 10 },
                            }}
                          />
                          <Tooltip
                            label={
                              session.id === activeSessionId ? 'Close session' : 'Archive session'
                            }
                          >
                            <ActionIcon
                              size="xs"
                              variant="subtle"
                              color="gray"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (session.id === activeSessionId) {
                                  onClearSession?.();
                                }
                                onArchiveSession?.(session.id);
                              }}
                              style={{
                                position: 'absolute',
                                right: 8,
                                top: '50%',
                                transform: 'translateY(-50%)',
                                opacity: 0,
                                transition: 'opacity 150ms ease',
                              }}
                              className="session-close-btn"
                            >
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </ActionIcon>
                          </Tooltip>
                          <style>{`
                        .session-item:hover .session-close-btn {
                          opacity: 1 !important;
                        }
                      `}</style>
                        </Box>
                      );
                    })}
                  </NavLink>
                </Box>
              );
            })}
      </ScrollArea>
    </Stack>
  );
}
