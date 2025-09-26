/**
 * Azure DevOps API models and interfaces
 *
 * Based on Azure DevOps REST API v7.1-preview.1
 * https://docs.microsoft.com/en-us/rest/api/azure/devops/
 */

/**
 * Azure DevOps user identity
 */
export interface Identity {
  readonly id: string;
  readonly displayName: string;
  readonly uniqueName: string;
  readonly url?: string;
  readonly imageUrl?: string;
  readonly descriptor?: string;
}

/**
 * Git repository reference
 */
export interface GitRepository {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly project: TeamProject;
  readonly defaultBranch: string;
  readonly size: number;
  readonly remoteUrl: string;
  readonly sshUrl: string;
  readonly webUrl: string;
  readonly isDisabled: boolean;
}

/**
 * Team project information
 */
export interface TeamProject {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly url: string;
  readonly state:
    | "deleting"
    | "new"
    | "wellFormed"
    | "createPending"
    | "updating"
    | "unchanged";
  readonly revision: number;
  readonly visibility: "private" | "public";
  readonly lastUpdateTime: Date;
}

/**
 * Git commit reference
 */
export interface GitCommitRef {
  readonly commitId: string;
  readonly author: GitUserDate;
  readonly committer: GitUserDate;
  readonly comment: string;
  readonly commentTruncated: boolean;
  readonly url: string;
  readonly remoteUrl: string;
}

/**
 * Git user date information
 */
export interface GitUserDate {
  readonly name: string;
  readonly email: string;
  readonly date: Date;
}

/**
 * Pull request status enumeration
 */
export type PullRequestStatus =
  | "abandoned"
  | "active"
  | "completed"
  | "draft"
  | "notSet";

/**
 * Pull request vote enumeration
 */
export type PullRequestVote = -10 | -5 | 0 | 5 | 10;

/**
 * Pull request merge status
 */
export type PullRequestMergeStatus =
  | "conflicts"
  | "failure"
  | "notSet"
  | "queued"
  | "rejectedByPolicy"
  | "succeeded";

/**
 * Azure DevOps Pull Request model
 */
export interface PullRequest {
  readonly pullRequestId: number;
  readonly codeReviewId: number;
  readonly status: PullRequestStatus;
  readonly createdBy: Identity;
  readonly creationDate: Date;
  readonly closedDate?: Date;
  readonly title: string;
  readonly description: string;
  readonly sourceRefName: string;
  readonly targetRefName: string;
  readonly mergeStatus: PullRequestMergeStatus;
  readonly isDraft: boolean;
  readonly mergeId: string;
  readonly lastMergeSourceCommit: GitCommitRef;
  readonly lastMergeTargetCommit: GitCommitRef;
  readonly lastMergeCommit?: GitCommitRef;
  readonly reviewers: PullRequestReviewer[];
  readonly url: string;
  readonly webUrl: string;
  readonly repository: GitRepository;
  readonly workItemRefs: ResourceRef[];
  readonly labels: WebApiTagDefinition[];
  readonly hasMultipleMergeBases: boolean;
  readonly supportsIterations: boolean;
  readonly artifactId: string;
}

/**
 * Pull request reviewer with vote information
 */
export interface PullRequestReviewer {
  readonly reviewerUrl: string;
  readonly vote: PullRequestVote;
  readonly hasDeclined: boolean;
  readonly isFlagged: boolean;
  readonly displayName: string;
  readonly url: string;
  readonly id: string;
  readonly uniqueName: string;
  readonly imageUrl: string;
  readonly isRequired: boolean;
  readonly isContainer?: boolean;
}

/**
 * Pull request comment thread
 */
export interface CommentThread {
  readonly id: number;
  readonly publishedDate?: Date | undefined;
  readonly lastUpdatedDate?: Date | undefined;
  readonly comments: Comment[];
  readonly status: CommentThreadStatus;
  readonly threadContext?: CommentThreadContext | undefined;
  readonly properties?: any;
  readonly identities?: { [key: string]: Identity } | undefined;
  readonly isDeleted: boolean;
  readonly pullRequestThreadContext?:
    | PullRequestCommentThreadContext
    | undefined;
}

/**
 * Comment thread status
 */
export type CommentThreadStatus =
  | "active"
  | "byDesign"
  | "closed"
  | "fixed"
  | "pending"
  | "unknown"
  | "wontFix";

/**
 * Individual comment within a thread
 */
export interface Comment {
  readonly id: number;
  readonly parentCommentId?: number | undefined;
  readonly author: Identity;
  readonly content: string;
  readonly publishedDate: Date;
  readonly lastUpdatedDate?: Date | undefined;
  readonly lastContentUpdatedDate?: Date | undefined;
  readonly commentType: CommentType;
  readonly usersLiked?: Identity[] | undefined;
  readonly isDeleted: boolean;
  readonly url?: string | undefined;
}

/**
 * Comment type enumeration
 */
export type CommentType = "codeChange" | "system" | "text" | "unknown";

/**
 * Comment thread context for file positioning
 */
export interface CommentThreadContext {
  readonly filePath?: string;
  readonly leftFileStart?: CommentPosition;
  readonly leftFileEnd?: CommentPosition;
  readonly rightFileStart?: CommentPosition;
  readonly rightFileEnd?: CommentPosition;
}

/**
 * Pull request specific comment thread context
 */
export interface PullRequestCommentThreadContext {
  readonly changeTrackingId?: number;
  readonly iterationContext?: CommentIterationContext;
  readonly trackingCriteria?: CommentTrackingCriteria;
}

/**
 * Comment iteration context
 */
export interface CommentIterationContext {
  readonly firstComparingIteration: number;
  readonly secondComparingIteration: number;
}

/**
 * Comment tracking criteria
 */
export interface CommentTrackingCriteria {
  readonly firstComparingIteration?: number;
  readonly secondComparingIteration?: number;
  readonly origLeftFileStart?: CommentPosition;
  readonly origLeftFileEnd?: CommentPosition;
  readonly origRightFileStart?: CommentPosition;
  readonly origRightFileEnd?: CommentPosition;
}

/**
 * Position within a file for comments
 */
export interface CommentPosition {
  readonly line: number;
  readonly offset: number;
}

/**
 * Resource reference (for work items, etc.)
 */
export interface ResourceRef {
  readonly id: string;
  readonly url?: string;
}

/**
 * Web API tag definition
 */
export interface WebApiTagDefinition {
  readonly id: string;
  readonly name: string;
  readonly url?: string;
}

/**
 * Pull request iteration (for tracking changes)
 */
export interface GitPullRequestIteration {
  readonly id: number;
  readonly description?: string;
  readonly author: Identity;
  readonly createdDate: Date;
  readonly updatedDate: Date;
  readonly sourceRefCommit: GitCommitRef;
  readonly targetRefCommit: GitCommitRef;
  readonly commonRefCommit: GitCommitRef;
  readonly hasMoreCommits: boolean;
  readonly changeList: GitPullRequestChange[];
  readonly newTargetRefName?: string;
  readonly oldTargetRefName?: string;
  readonly reason?: IterationReason;
}

/**
 * Iteration reason enumeration
 */
export type IterationReason =
  | "create"
  | "forcePush"
  | "push"
  | "rebase"
  | "retarget"
  | "unknown";

/**
 * Pull request file change
 */
export interface GitPullRequestChange {
  readonly changeId: number;
  readonly changeType: VersionControlChangeType;
  readonly item: GitItem;
  readonly originalPath?: string;
}

/**
 * Version control change type
 */
export type VersionControlChangeType =
  | "add"
  | "branch"
  | "delete"
  | "edit"
  | "encoding"
  | "lock"
  | "merge"
  | "none"
  | "property"
  | "rename"
  | "rollback"
  | "sourceRename"
  | "targetRename"
  | "undelete";

/**
 * Git item (file or folder)
 */
export interface GitItem {
  readonly objectId: string;
  readonly originalObjectId?: string;
  readonly gitObjectType: GitObjectType;
  readonly commitId: string;
  readonly path: string;
  readonly isFolder: boolean;
  readonly url: string;
  readonly contentMetadata?: FileContentMetadata;
}

/**
 * Git object type enumeration
 */
export type GitObjectType =
  | "bad"
  | "blob"
  | "commit"
  | "ext2"
  | "ofsDelta"
  | "refDelta"
  | "tag"
  | "tree";

/**
 * File content metadata
 */
export interface FileContentMetadata {
  readonly contentType: string;
  readonly encoding?: number;
  readonly extension?: string;
  readonly fileName?: string;
  readonly isBinary?: boolean;
  readonly isImage?: boolean;
  readonly vsLink?: string;
}

/**
 * API response wrapper for paginated results
 */
export interface ApiResponse<T> {
  readonly count: number;
  readonly value: T[];
}

/**
 * Error response from Azure DevOps API
 */
export interface ApiErrorResponse {
  readonly message: string;
  readonly typeKey?: string;
  readonly errorCode?: number;
  readonly eventId?: number;
  readonly innerException?: ApiErrorResponse;
}

/**
 * Policy evaluation record for pull requests
 */
export interface PolicyEvaluationRecord {
  readonly evaluationId: string;
  readonly startedDate: Date;
  readonly completedDate?: Date;
  readonly status: PolicyEvaluationStatus;
  readonly configuration: PolicyConfiguration;
  readonly context?: any;
}

/**
 * Policy evaluation status
 */
export type PolicyEvaluationStatus =
  | "approved"
  | "broken"
  | "failed"
  | "notApplicable"
  | "queued"
  | "rejected"
  | "running";

/**
 * Policy configuration
 */
export interface PolicyConfiguration {
  readonly id: number;
  readonly type: PolicyType;
  readonly url: string;
  readonly revision: number;
  readonly isEnabled: boolean;
  readonly isBlocking: boolean;
  readonly isDeleted: boolean;
  readonly settings: any;
  readonly displayName?: string;
}

/**
 * Policy type definition
 */
export interface PolicyType {
  readonly id: string;
  readonly displayName: string;
  readonly url: string;
  readonly description?: string;
}
