import { readFile, writeFile, editFile, deleteFile, listFiles, copyFile, moveFile, createDirectory, type EditChange } from "../tools/fileTool";
import { runCommand, startBackground, stopBackground, stopAll } from "../tools/terminalTool";
import { searchCode, findFiles, findAndReplace } from "../tools/searchTool";
import { installPackage, removePackage, listPackages, installAll } from "../tools/packageTool";
import { gitStatus, gitDiff, gitLog, gitCommit, gitBranch, gitCheckout, gitStash, gitReset, gitAdd, gitInit } from "../tools/gitTool";
import { dbQuery, dbDescribe, dbListTables, dbRunMigration, dbDrizzlePush, dbDrizzleGenerate, dbDrizzleMigrate, dbSeed } from "../tools/dbTool";
import { httpRequest, checkHealth, checkUrl, fetchPage, waitForServer } from "../tools/browserTool";
import { detectProjectType, generateDockerfile, generateDockerCompose, deployDocker, generateCICD, generateNginxConfig } from "../tools/deployTool";
import { startDevServer, stopServer, restartServer, checkServerHealth, testEndpoints, getAllPreviews } from "../tools/previewTool";
import { runTests, runSingleTest, generateTests, setupTestFramework } from "../tools/testTool";
import { setupEslint, lint, format, typeCheck, setupHusky } from "../tools/lintTool";
import { getEnvVars, setEnvVar, removeEnvVar, generateEnvExample, validateEnv, generateEnvTypes, ensureGitignore } from "../tools/envTool";
import { listTemplates, scaffold } from "../tools/scaffoldTool";
import { createSnapshot, restoreSnapshot, listSnapshots, deleteSnapshot, diffSnapshot, cleanOldSnapshots } from "../tools/snapshotTool";
import { generateReadme, generateApiDocs, generateJSDoc, generateChangelog } from "../tools/docgenTool";
import { getSystemMetrics, bundleAnalysis, simpleLoadTest, analyzeNodeModules } from "../tools/performanceTool";
import { httpRequest as networkHttpRequest, networkPing, checkDns, checkSsl } from "../tools/networkTool";
import { startWatcher, stopWatcher, stopAllWatchers, listWatchers, getWatcherEvents } from "../tools/watcherTool";
import { addTask, cancelTask, getTaskStatus, listTasks, getQueueStats, clearQueue } from "../tools/taskQueueTool";
import { reviewFile, reviewProject, securityScan } from "../tools/codeReviewTool";
import { checkOutdated, checkVulnerabilities, fixVulnerabilities, findUnusedDeps, findCircularDeps, updateDependency } from "../tools/dependencyTool";
import { orchestrate, agentDiscussion, listAgents, getOrchestratorLog, spawnParallelAgents, getParallelStatus, cancelParallelSession } from "./orchestrator";
import { startSelfHealing, stopSelfHealing, getSelfHealStatus, runAllChecksNow, addHealthCheck } from "../tools/selfHealTool";
import { designSystem, generateSchemaFromDesign, generateAPIFromDesign, reviewArchitecture, generateDiagram } from "../tools/aiArchitectTool";
import { generateFullCRUD, generateAuthSystem, generateFromDescription } from "../tools/fullStackGeneratorTool";
import { extractStrings, generateTranslations, setupI18n } from "../tools/i18nTool";
import { seoAudit, generateSitemap, generateRobotsTxt, generateMetaTags, generateStructuredData } from "../tools/seoTool";
import { a11yAudit, a11yAutoFix } from "../tools/a11yTool";
import { getCollabUsers, getCollabHistory, getCollabStatus } from "../tools/realtimeCollabTool";
import { analyzeProject, recordTask, getContextForTask, getAgentStats } from "../tools/smartContextTool";
import { migrateFramework, migrateDatabase, migrateCSS } from "../tools/migrationTool";
import { chatInConversation, createConversation, listConversations, getConversation, deleteConversation, searchConversations } from "../tools/conversationTool";
import { startDebug, stopDebug, addBreakpoint, removeBreakpointById, analyzeError as debugAnalyzeError, profileCode, getDebugSessions } from "../tools/debuggerTool";
import { dbGetTables, dbGetTableInfo, dbQuery, dbExecuteSQL, dbInsertRow, dbUpdateRow, dbDeleteRow, dbGetSchema, dbGenerateSeed } from "../tools/databaseGUITool";
import { parseLogFile, queryLogs, getLogStats, captureOutput, clearLogs, tailLogFile } from "../tools/logViewerTool";
import { generateOpenAPISpec, generateGraphQLSchema, generateWebSocketServer, generateMockServer, generateWebhookSystem, setupSwaggerUI } from "../tools/apiGenTool";
import { registerCronJob, enableCronJob, disableCronJob, runCronNow, removeCronJob, listCronJobs, getCronLogs, stopAllCronJobs } from "../tools/cronTool";
import { createFeatureFlag, checkFeatureFlag, toggleFeatureFlag, updateFeatureFlag, deleteFeatureFlag, listFeatureFlags, generateFlagSDK } from "../tools/featureFlagsTool";
import { loadPlugin, installPlugin, uninstallPlugin, listPlugins, togglePlugin, triggerHook, callPluginTool, getAvailableHooks, loadAllPlugins } from "../tools/pluginSystemTool";
import { startProcess, stopProcess, restartProcess, stopAllProcesses, listProcesses, getProcessInfo, getProcessByName } from "../tools/processManagerTool";
import { generateCommitMessage, autoCommit, generateChangelog as aiGenerateChangelog } from "../tools/aiCommitTool";
import { detectConflicts, resolveConflict, resolveAllConflicts } from "../tools/mergeConflictTool";
import { renameSymbol, extractFunction, moveToFile, autoImport } from "../tools/refactoringTool";
import { optimizeImage, optimizeBatch, generateResponsiveImages, convertToWebP, generateFavicons, generateOGImage, generatePlaceholder } from "../tools/imageOptimizationTool";
import { generateEmailTemplate, setupEmailService, generateEmailService, previewEmailTemplate, listEmailTemplates } from "../tools/emailTemplateTool";
import { createQueue, addJob, getQueueStatus, getJobInfo, retryJob, clearQueue as clearJobQueue, generateBullMQSetup, addScheduledJob } from "../tools/queueSystemTool";
import { cacheGet, cacheSet, cacheDelete, cacheInvalidateByTag, cacheStats, cacheClear, generateRedisCache } from "../tools/cacheTool";
import { createSearchIndex, indexDocument, searchDocuments, removeDocument, getIndexStats, generateMeiliSearchSetup } from "../tools/searchEngineTool";
import { createRateLimiter, checkRateLimit, getRateLimitStatus, resetRateLimit, generateRateLimitMiddleware } from "../tools/rateLimitTool";
import { uploadFile, getUploadedFile, deleteUploadedFile, listUploadedFiles, generateUploadMiddleware, generateS3Storage } from "../tools/fileUploadTool";
import { createSSEChannel, sendSSEEvent, listSSEChannels, getSSEEventLog, generateSSEServer } from "../tools/sseTool";
import { kvSet, kvGet, kvDelete, kvList, kvClear, kvIncrement, kvDecrement, kvGetAll, kvHas, kvPush, kvPop, kvEntries, generateKVRoutes } from "../tools/kvStoreTool";
import { generateFormFromSchema, generateCRUDForms, generateFormValidation } from "../tools/formBuilderTool";
import { generateDataGrid, generateDataGridFromTable } from "../tools/dataGridTool";
import { trackEvent, getAnalytics, getTopEvents, generateAnalyticsSetup } from "../tools/analyticsTool";
import { generatePDFTemplate, generateInvoicePDF, generateReportPDF } from "../tools/pdfTool";
import { sendNotification, sendBulkNotification, getNotificationHistory, getNotificationStats, generateNotificationService, generateNotificationBell } from "../tools/notificationTool";
import { generateMonacoEditor, generateTerminalUI, generateFileTree, generateDiffViewer, generateSplitPane, generateResponsivePreview, generateErrorOverlay, generateSkeletonLoader, generateAIForm, generateAIDataGrid, generateSkeletonFromComponent, generateErrorBoundary, generateCommandPalette } from "../tools/uiGenTool";
import { generateSecurityMiddleware, generateHelmetConfig, generateCorsConfig, generateInputSanitizer, generateRequestLogger } from "../tools/securityTool";
import { analyzeImage, extractTextFromImage, analyzeUIScreenshot, compareImages, analyzeDocument, analyzeChartOrDiagram, analyzeErrorScreenshot, describeImageForAlt, analyzeImageFromBase64, analyzeImageFromURL } from "../tools/visionTool";
import { cacheGet as llmCacheGet, cacheSet as llmCacheSet, cacheClear as llmCacheClear, getCacheStats as llmCacheStats, getPerformanceMetrics, resetPerformanceMetrics, getSlowestTools } from "../tools/responseSpeedTool";
import { thinkDeep, analyzeMultipleStrategies, selfReflect, learnFromMistake, recallLessons, codeReview360, explainLikeExpert, debugWithHypotheses, synthesizeKnowledge, predictImpact, getReasoningHistory } from "../tools/cognitiveTool";
import { runBuildFlow, getBuildFlowStatus } from "../flows/buildFlow";
import { diagnoseAndFix as diagnosticDiagnoseAndFix, quickFix, recoverServer } from "../flows/diagnosticFlow";
import { createModel, addField, removeField, seedModel, cleanupData, createDataPipeline, validateDataIntegrity } from "../flows/dataFlow";
import { initRealtimeFlow, publishToChannel, publishAgentStatus, publishError as publishErrorEvent, publishBuildStatus, getRealtimeChannels, getRealtimeHistory, cleanupRealtime } from "../flows/realtimeFlow";
import { runQualityGates, runSingleGate, getQualityScore } from "../flows/qualityGateFlow";
import { upgradeAll, checkUpgrades, upgradeSingle } from "../flows/upgradeFlow";
import { splitAndExecute, addParallelTask, moveParallelTask, mergeParallelTasks, getParallelBoard, getParallelTask } from "../flows/parallelAgentFlow";
import { testApp as browserTestApp, testPageLoad, startPeriodicTesting, stopPeriodicTesting } from "../tools/browserTestTool";
import { spawnAgent, deployAgent, stopAgent, listSpawnedAgents, getAgentLogs } from "../tools/agentSpawnerTool";
import { generateDesignVariants, applyDesignVariant, generatePageDesign, convertToMobile, listDesignElements } from "../tools/designCanvasTool";
import { listAvailableConnectors, connectService, disconnectService, listConnectedServices } from "../tools/connectorsTool";
import { searchForSolution, searchDocs, searchForPackage } from "../tools/webSearchBuildTool";
import { generateLambda, generateWorker, generateEdgeFunction, generateK8sManifests, generateTerraform } from "../tools/serverlessTool";
import { setupStripe, setupAnalytics, setupSentry, setupSearch, setupPDFGen, setupEnvironments } from "../tools/integrationsTool";
import { getTokenStats, estimateTokenCost, getRecentTokenUsage, resetTokenStats } from "../tools/tokenTrackerTool";
import { setAgentMode, getAgentMode, toggleAgentFeature, estimateModeCost, listAgentModes } from "../tools/agentModeTool";
import { createPlan, approvePlanTask, rejectPlanTask, modifyPlanTask, approveAllPlanTasks, getPlan, getApprovedTasks } from "../tools/planModeTool";
import { createCheckpoint, startAutoCheckpoints, stopAutoCheckpoints, getTimeline, timeTravelTo, compareToCheckpoint, getCheckpointPreview } from "../tools/checkpointTool";
import { generateSlides, generateAnimation, generateDashboard, generateKPICards } from "../tools/contentGenTool";
import { connectMCPServer, callMCPTool, listMCPServers, listMCPTools, disconnectMCPServer, generateMCPServer } from "../tools/mcpTool";
import { analyzeAndOptimize, quickOptimize } from "../tools/codeOptimizeTool";
import { deepThink, architectReview, debugWithReasoning } from "../tools/extendedThinkingTool";
import { routeToModel, recordRoutingResult, getRoutingStats, listAvailableModels } from "../tools/multiModelRouterTool";
import { addToContext, compressContext, smartFileSelect, getContextSummary, clearContext } from "../tools/contextManagerTool";
import { learnFromSuccess, learnFromFailure, recallLearnings, addPattern, addPreference, getLearningStats } from "../tools/learningEngineTool";
import { buildCodeGraph, findDependents, findDeadCode, getFileInfo, getGraphStats } from "../tools/codeGraphTool";
import { autoRecover, selfHealBuild, watchAndRecover, getRecoveryLog } from "../tools/autoRecoveryTool";
import { proactiveScan, suggestFeatures, healthCheck } from "../tools/proactiveTool";
import { streamGenerate, streamCode, streamExplain, getStreamStatus } from "../tools/streamingTool";
import { applySmartDiff, multiFileEdit, generateDiff, revertFile } from "../tools/diffPatchTool";
import { importFromFigma, importFromFigmaJSON, figmaToReact, cssToTailwind } from "../tools/figmaImportTool";
import { setupExpo, generateMobileScreen, buildForPlatform, setupEAS, setupPushNotifications } from "../tools/mobileDeployTool";
import { setupAudioCapabilities, generateTranscription, generateSpeech } from "../tools/audioTool";
import { getRules, updateRules, setCustomRule, getAgentContext, initRules } from "../tools/rulesSyncTool";
import { hotfix, rollbackHotfix } from "../flows/hotfixFlow";
import { getFullHealth, getQuickStatus, checkServicesHealth, getSystemMetricsDetailed } from "../tools/healthDashboardTool";
import { setupSnowflake, setupBigQuery, setupDatabricks } from "../tools/dataWarehouseTool";
import { enqueueRequest, getQueueStatus as getRequestQueueStatusV2, cancelQueuedRequest } from "../tools/requestQueueTool";
import { getAgentMode as getAgentModeV2, setAgentMode as setAgentModeV2, toggleAgentFeature as toggleAgentFeatureV2, estimateTaskCost } from "../agent/agentModes";
import { createPlan as createPlanV2, getPlan as getPlanV2, approvePlanTask as approvePlanTaskV2, rejectPlanTask as rejectPlanTaskV2, modifyPlanTask as modifyPlanTaskV2 } from "../flows/planModeFlow";
import { fastExec, batchReadFiles, batchWriteFiles, batchCheckExists, runParallelTasks, checkStepNeeded, markStepCompleted, getSpeedStats as getSpeedStatsV2, clearSpeedCaches, resetStepOptimizer } from "../tools/speedEngineTool";
import { brainThink, brainRememberError, brainRememberDecision, brainLearnPattern, brainSetSessionGoal, brainAddContext, brainRememberFile, brainGetStats, brainSave, brainReset } from "../tools/brainTool";
import { selfCheckFull, selfCheckQuick, selfCheckSingle } from "../tools/selfCheckTool";
import { callLLM, type LLMMessage, type ToolDef } from "../llm/client";
import { fillPrompt, EXECUTOR_PROMPT, EDIT_FILE_PROMPT } from "../llm/prompts";
import { extractJSON, extractTextContent } from "../llm/parser";
import { AgentMemory } from "./memory";
import type { Step } from "./planner";

const TOOL_MAP: Record<string, (params: any) => Promise<any>> = {
  read_file: readFile,
  write_file: writeFile,
  edit_file: editFile,
  delete_file: deleteFile,
  list_files: listFiles,
  run_command: runCommand,
  search_code: searchCode,
  find_files: findFiles,
  install_package: installPackage,
  remove_package: removePackage,
  list_packages: listPackages,
  git_status: gitStatus,
  git_diff: gitDiff,
  git_log: gitLog,
  git_commit: gitCommit,
  db_query: dbQuery,
  db_describe: dbDescribe,
  db_list_tables: dbListTables,
  http_request: httpRequest,
  check_health: checkHealth,
  copy_file: copyFile,
  move_file: moveFile,
  create_directory: createDirectory,
  create_file: (p: any) => writeFile(p),
  start_background: startBackground,
  stop_background: stopBackground,
  find_and_replace: findAndReplace,
  search_content: searchCode,
  install_all: installAll,
  git_branch: gitBranch,
  git_checkout: gitCheckout,
  git_stash: gitStash,
  git_reset: gitReset,
  git_add: gitAdd,
  git_init: gitInit,
  db_run_migration: dbRunMigration,
  db_drizzle_push: dbDrizzlePush,
  db_drizzle_generate: dbDrizzleGenerate,
  db_drizzle_migrate: dbDrizzleMigrate,
  db_seed: dbSeed,
  db_operation: dbQuery,
  check_url: checkUrl,
  fetch_page: fetchPage,
  wait_for_server: waitForServer,
  detect_project_type: detectProjectType,
  generate_dockerfile: generateDockerfile,
  generate_docker_compose: generateDockerCompose,
  deploy_docker: deployDocker,
  generate_cicd: generateCICD,
  generate_nginx_config: generateNginxConfig,
  start_dev_server: startDevServer,
  stop_server: stopServer,
  restart_server: restartServer,
  check_server_health: checkServerHealth,
  test_endpoints: testEndpoints,
  get_all_previews: getAllPreviews,
  run_tests: runTests,
  run_single_test: runSingleTest,
  generate_tests: generateTests,
  setup_test_framework: setupTestFramework,
  setup_eslint: setupEslint,
  lint: lint,
  format: format,
  type_check: typeCheck,
  setup_husky: setupHusky,
  get_env_vars: getEnvVars,
  set_env_var: setEnvVar,
  remove_env_var: removeEnvVar,
  generate_env_example: generateEnvExample,
  validate_env: validateEnv,
  generate_env_types: generateEnvTypes,
  ensure_gitignore: ensureGitignore,
  list_templates: listTemplates,
  scaffold: scaffold,
  create_snapshot: createSnapshot,
  restore_snapshot: restoreSnapshot,
  list_snapshots: listSnapshots,
  delete_snapshot: deleteSnapshot,
  diff_snapshot: diffSnapshot,
  clean_old_snapshots: cleanOldSnapshots,
  generate_readme: generateReadme,
  generate_api_docs: generateApiDocs,
  generate_jsdoc: generateJSDoc,
  generate_changelog: generateChangelog,
  get_system_metrics: getSystemMetrics,
  bundle_analysis: bundleAnalysis,
  simple_load_test: simpleLoadTest,
  analyze_node_modules: analyzeNodeModules,
  http_request: networkHttpRequest,
  network_ping: networkPing,
  check_dns: checkDns,
  check_ssl: checkSsl,
  start_watcher: startWatcher,
  stop_watcher: stopWatcher,
  stop_all_watchers: stopAllWatchers,
  list_watchers: listWatchers,
  get_watcher_events: getWatcherEvents,
  add_task: addTask,
  cancel_task: cancelTask,
  get_task_status: getTaskStatus,
  list_tasks: listTasks,
  get_queue_stats: getQueueStats,
  clear_queue: clearQueue,
  review_file: reviewFile,
  review_project: reviewProject,
  security_scan: securityScan,
  check_outdated: checkOutdated,
  check_vulnerabilities: checkVulnerabilities,
  fix_vulnerabilities: fixVulnerabilities,
  find_unused_deps: findUnusedDeps,
  find_circular_deps: findCircularDeps,
  update_dependency: updateDependency,
  orchestrate: orchestrate,
  agent_discussion: agentDiscussion,
  list_agents: listAgents,
  get_orchestrator_log: getOrchestratorLog,
  spawn_parallel_agents: spawnParallelAgents,
  get_parallel_status: getParallelStatus,
  cancel_parallel_session: cancelParallelSession,
  start_self_healing: startSelfHealing,
  stop_self_healing: stopSelfHealing,
  get_self_heal_status: getSelfHealStatus,
  run_all_checks_now: runAllChecksNow,
  add_health_check: addHealthCheck,
  design_system: designSystem,
  generate_schema_from_design: generateSchemaFromDesign,
  generate_api_from_design: generateAPIFromDesign,
  review_architecture: reviewArchitecture,
  generate_diagram: generateDiagram,
  generate_full_crud: generateFullCRUD,
  generate_auth_system: generateAuthSystem,
  generate_from_description: generateFromDescription,
  extract_strings: extractStrings,
  generate_translations: generateTranslations,
  setup_i18n: setupI18n,
  seo_audit: seoAudit,
  generate_sitemap: generateSitemap,
  generate_robots_txt: generateRobotsTxt,
  generate_meta_tags: generateMetaTags,
  generate_structured_data: generateStructuredData,
  a11y_audit: a11yAudit,
  a11y_auto_fix: a11yAutoFix,
  get_collab_users: getCollabUsers,
  get_collab_history: getCollabHistory,
  get_collab_status: getCollabStatus,
  analyze_project: analyzeProject,
  record_task: recordTask,
  get_context_for_task: getContextForTask,
  get_agent_stats: getAgentStats,
  migrate_framework: migrateFramework,
  migrate_database: migrateDatabase,
  migrate_css: migrateCSS,
  chat_conversation: chatInConversation,
  create_conversation: createConversation,
  list_conversations: listConversations,
  get_conversation: getConversation,
  delete_conversation: deleteConversation,
  search_conversations: searchConversations,
  start_debug: startDebug,
  stop_debug: stopDebug,
  add_breakpoint: addBreakpoint,
  remove_breakpoint: removeBreakpointById,
  analyze_error: debugAnalyzeError,
  profile_code: profileCode,
  get_debug_sessions: getDebugSessions,
  db_get_tables: dbGetTables,
  db_get_table_info: dbGetTableInfo,
  db_query: dbQuery,
  db_execute_sql: dbExecuteSQL,
  db_insert_row: dbInsertRow,
  db_update_row: dbUpdateRow,
  db_delete_row: dbDeleteRow,
  db_get_schema: dbGetSchema,
  db_generate_seed: dbGenerateSeed,
  parse_log_file: parseLogFile,
  query_logs: queryLogs,
  get_log_stats: getLogStats,
  capture_output: captureOutput,
  clear_logs: clearLogs,
  tail_log_file: tailLogFile,
  generate_openapi_spec: generateOpenAPISpec,
  generate_graphql_schema: generateGraphQLSchema,
  generate_websocket_server: generateWebSocketServer,
  generate_mock_server: generateMockServer,
  generate_webhook_system: generateWebhookSystem,
  setup_swagger_ui: setupSwaggerUI,
  register_cron_job: registerCronJob,
  enable_cron_job: enableCronJob,
  disable_cron_job: disableCronJob,
  run_cron_now: runCronNow,
  remove_cron_job: removeCronJob,
  list_cron_jobs: listCronJobs,
  get_cron_logs: getCronLogs,
  stop_all_cron_jobs: stopAllCronJobs,
  create_feature_flag: createFeatureFlag,
  check_feature_flag: checkFeatureFlag,
  toggle_feature_flag: toggleFeatureFlag,
  update_feature_flag: updateFeatureFlag,
  delete_feature_flag: deleteFeatureFlag,
  list_feature_flags: listFeatureFlags,
  generate_flag_sdk: generateFlagSDK,
  load_plugin: loadPlugin,
  install_plugin: installPlugin,
  uninstall_plugin: uninstallPlugin,
  list_plugins: listPlugins,
  toggle_plugin: togglePlugin,
  trigger_hook: triggerHook,
  call_plugin_tool: callPluginTool,
  get_available_hooks: getAvailableHooks,
  load_all_plugins: loadAllPlugins,
  start_process: startProcess,
  stop_process: stopProcess,
  restart_process: restartProcess,
  stop_all_processes: stopAllProcesses,
  list_processes: listProcesses,
  get_process_info: getProcessInfo,
  get_process_by_name: getProcessByName,
  generate_commit_message: generateCommitMessage,
  auto_commit: autoCommit,
  ai_generate_changelog: aiGenerateChangelog,
  detect_conflicts: detectConflicts,
  resolve_conflict: resolveConflict,
  resolve_all_conflicts: resolveAllConflicts,
  rename_symbol: renameSymbol,
  extract_function: extractFunction,
  move_to_file: moveToFile,
  auto_import: autoImport,
  optimize_image: optimizeImage,
  optimize_batch: optimizeBatch,
  generate_responsive_images: generateResponsiveImages,
  convert_to_webp: convertToWebP,
  generate_favicons: generateFavicons,
  generate_og_image: generateOGImage,
  generate_placeholder: generatePlaceholder,
  generate_email_template: generateEmailTemplate,
  setup_email_service: setupEmailService,
  generate_email_service: generateEmailService,
  preview_email_template: previewEmailTemplate,
  list_email_templates: listEmailTemplates,
  create_queue: createQueue,
  add_job: addJob,
  get_queue_status: getQueueStatus,
  get_job_info: getJobInfo,
  retry_job: retryJob,
  clear_job_queue: clearJobQueue,
  generate_bullmq_setup: generateBullMQSetup,
  add_scheduled_job: addScheduledJob,
  cache_get: cacheGet,
  cache_set: cacheSet,
  cache_delete: cacheDelete,
  cache_invalidate_by_tag: cacheInvalidateByTag,
  cache_stats: cacheStats,
  cache_clear: cacheClear,
  generate_redis_cache: generateRedisCache,
  create_search_index: createSearchIndex,
  index_document: indexDocument,
  search_documents: searchDocuments,
  remove_document: removeDocument,
  get_index_stats: getIndexStats,
  generate_meilisearch_setup: generateMeiliSearchSetup,
  create_rate_limiter: createRateLimiter,
  check_rate_limit: checkRateLimit,
  get_rate_limit_status: getRateLimitStatus,
  reset_rate_limit: resetRateLimit,
  generate_rate_limit_middleware: generateRateLimitMiddleware,
  upload_file: uploadFile,
  get_uploaded_file: getUploadedFile,
  delete_uploaded_file: deleteUploadedFile,
  list_uploaded_files: listUploadedFiles,
  generate_upload_middleware: generateUploadMiddleware,
  generate_s3_storage: generateS3Storage,
  create_sse_channel: createSSEChannel,
  send_sse_event: sendSSEEvent,
  list_sse_channels: listSSEChannels,
  get_sse_event_log: getSSEEventLog,
  generate_sse_server: generateSSEServer,
  kv_set: kvSet,
  kv_get: kvGet,
  kv_delete: kvDelete,
  kv_list: kvList,
  kv_clear: kvClear,
  kv_increment: kvIncrement,
  kv_decrement: kvDecrement,
  kv_get_all: kvGetAll,
  kv_has: kvHas,
  kv_push: kvPush,
  kv_pop: kvPop,
  kv_entries: kvEntries,
  generate_kv_routes: generateKVRoutes,
  generate_form_from_schema: generateFormFromSchema,
  generate_crud_forms: generateCRUDForms,
  generate_form_validation: generateFormValidation,
  generate_data_grid: generateDataGrid,
  generate_data_grid_from_table: generateDataGridFromTable,
  track_event: trackEvent,
  get_analytics: getAnalytics,
  get_top_events: getTopEvents,
  generate_analytics_setup: generateAnalyticsSetup,
  generate_pdf_template: generatePDFTemplate,
  generate_invoice_pdf: generateInvoicePDF,
  generate_report_pdf: generateReportPDF,
  send_notification: sendNotification,
  send_bulk_notification: sendBulkNotification,
  get_notification_history: getNotificationHistory,
  get_notification_stats: getNotificationStats,
  generate_notification_service: generateNotificationService,
  generate_notification_bell: generateNotificationBell,
  generate_monaco_editor: generateMonacoEditor,
  generate_terminal_ui: generateTerminalUI,
  generate_file_tree: generateFileTree,
  generate_diff_viewer: generateDiffViewer,
  generate_split_pane: generateSplitPane,
  generate_responsive_preview: generateResponsivePreview,
  generate_error_overlay: generateErrorOverlay,
  generate_skeleton_loader: generateSkeletonLoader,
  generate_ai_form: generateAIForm,
  generate_ai_data_grid: generateAIDataGrid,
  generate_skeleton_from_component: generateSkeletonFromComponent,
  generate_error_boundary: generateErrorBoundary,
  generate_command_palette: generateCommandPalette,
  generate_security_middleware: generateSecurityMiddleware,
  generate_helmet_config: generateHelmetConfig,
  generate_cors_config: generateCorsConfig,
  generate_input_sanitizer: generateInputSanitizer,
  generate_request_logger: generateRequestLogger,
  analyze_image: analyzeImage,
  extract_text_from_image: extractTextFromImage,
  analyze_ui_screenshot: analyzeUIScreenshot,
  compare_images: compareImages,
  analyze_document: analyzeDocument,
  analyze_chart: analyzeChartOrDiagram,
  analyze_error_screenshot: analyzeErrorScreenshot,
  describe_image_for_alt: describeImageForAlt,
  analyze_image_base64: analyzeImageFromBase64,
  analyze_image_url: analyzeImageFromURL,
  cache_llm_get: llmCacheGet,
  cache_llm_set: llmCacheSet,
  cache_llm_clear: llmCacheClear,
  cache_llm_stats: llmCacheStats,
  get_performance_metrics: getPerformanceMetrics,
  reset_performance_metrics: resetPerformanceMetrics,
  get_slowest_tools: getSlowestTools,
  think_deep: thinkDeep,
  analyze_strategies: analyzeMultipleStrategies,
  self_reflect: selfReflect,
  learn_from_mistake: learnFromMistake,
  recall_lessons: recallLessons,
  code_review_360: codeReview360,
  explain_like_expert: explainLikeExpert,
  debug_with_hypotheses: debugWithHypotheses,
  synthesize_knowledge: synthesizeKnowledge,
  predict_impact: predictImpact,
  get_reasoning_history: getReasoningHistory,
  run_build_flow: runBuildFlow,
  get_build_flow_status: getBuildFlowStatus,
  diagnose_and_fix: diagnosticDiagnoseAndFix,
  quick_fix: quickFix,
  recover_server: recoverServer,
  create_data_model: createModel,
  add_model_field: addField,
  remove_model_field: removeField,
  seed_model_data: seedModel,
  cleanup_data: cleanupData,
  create_data_pipeline: createDataPipeline,
  validate_data_integrity: validateDataIntegrity,
  init_realtime: initRealtimeFlow,
  publish_to_channel: publishToChannel,
  publish_agent_status: publishAgentStatus,
  publish_error_event: publishErrorEvent,
  publish_build_status: publishBuildStatus,
  get_realtime_channels: getRealtimeChannels,
  get_realtime_history: getRealtimeHistory,
  cleanup_realtime: cleanupRealtime,
  run_quality_gates: runQualityGates,
  run_single_gate: runSingleGate,
  get_quality_score: getQualityScore,
  upgrade_all_deps: upgradeAll,
  check_upgrades: checkUpgrades,
  upgrade_single_dep: upgradeSingle,
  split_and_execute_parallel: splitAndExecute,
  add_parallel_task: addParallelTask,
  move_parallel_task: moveParallelTask,
  merge_parallel_tasks: mergeParallelTasks,
  get_parallel_board: getParallelBoard,
  get_parallel_task_detail: getParallelTask,
  browser_test_app: browserTestApp,
  test_page_load: testPageLoad,
  start_periodic_browser_test: startPeriodicTesting,
  stop_periodic_browser_test: stopPeriodicTesting,
  spawn_agent: spawnAgent,
  deploy_agent: deployAgent,
  stop_agent: stopAgent,
  list_spawned_agents: listSpawnedAgents,
  get_agent_logs: getAgentLogs,
  generate_design_variants: generateDesignVariants,
  apply_design_variant: applyDesignVariant,
  generate_page_design: generatePageDesign,
  convert_web_to_mobile: convertToMobile,
  list_design_elements: listDesignElements,
  list_available_connectors: listAvailableConnectors,
  connect_service: connectService,
  disconnect_service: disconnectService,
  list_connected_services: listConnectedServices,
  search_for_solution: searchForSolution,
  search_docs: searchDocs,
  search_for_package: searchForPackage,
  generate_lambda: generateLambda,
  generate_cloudflare_worker: generateWorker,
  generate_edge_function: generateEdgeFunction,
  generate_k8s_manifests: generateK8sManifests,
  generate_terraform: generateTerraform,
  setup_stripe_payments: setupStripe,
  setup_analytics: setupAnalytics,
  setup_sentry: setupSentry,
  setup_meilisearch: setupSearch,
  setup_pdf_generation: setupPDFGen,
  setup_environments: setupEnvironments,
  get_token_stats: getTokenStats,
  estimate_token_cost: estimateTokenCost,
  get_recent_token_usage: getRecentTokenUsage,
  reset_token_stats: resetTokenStats,
  set_agent_mode: setAgentMode,
  get_agent_mode: getAgentMode,
  toggle_agent_feature: toggleAgentFeature,
  estimate_mode_cost: estimateModeCost,
  list_agent_modes: listAgentModes,
  create_plan: createPlan,
  approve_plan_task: approvePlanTask,
  reject_plan_task: rejectPlanTask,
  modify_plan_task: modifyPlanTask,
  approve_all_plan_tasks: approveAllPlanTasks,
  get_plan: getPlan,
  get_approved_tasks: getApprovedTasks,
  create_checkpoint: createCheckpoint,
  start_auto_checkpoints: startAutoCheckpoints,
  stop_auto_checkpoints: stopAutoCheckpoints,
  get_checkpoint_timeline: getTimeline,
  time_travel_to: timeTravelTo,
  compare_to_checkpoint: compareToCheckpoint,
  preview_checkpoint: getCheckpointPreview,
  generate_slides: generateSlides,
  generate_animation: generateAnimation,
  generate_dashboard: generateDashboard,
  generate_kpi_cards: generateKPICards,
  connect_mcp_server: connectMCPServer,
  call_mcp_tool: callMCPTool,
  list_mcp_servers: listMCPServers,
  list_mcp_tools: listMCPTools,
  disconnect_mcp_server: disconnectMCPServer,
  generate_mcp_server: generateMCPServer,
  analyze_and_optimize: analyzeAndOptimize,
  quick_optimize: quickOptimize,
  deep_think: deepThink,
  architect_review: architectReview,
  debug_with_reasoning: debugWithReasoning,
  route_to_model: routeToModel,
  record_routing_result: recordRoutingResult,
  get_routing_stats: getRoutingStats,
  list_available_models: listAvailableModels,
  add_to_context: addToContext,
  compress_context: compressContext,
  smart_file_select: smartFileSelect,
  get_context_summary: getContextSummary,
  clear_context: clearContext,
  learn_from_success: learnFromSuccess,
  learn_from_failure: learnFromFailure,
  recall_learnings: recallLearnings,
  add_pattern: addPattern,
  add_preference: addPreference,
  get_learning_stats: getLearningStats,
  build_code_graph: buildCodeGraph,
  find_dependents: findDependents,
  find_dead_code: findDeadCode,
  get_file_info: getFileInfo,
  get_graph_stats: getGraphStats,
  auto_recover: autoRecover,
  self_heal_build: selfHealBuild,
  watch_and_recover: watchAndRecover,
  get_recovery_log: getRecoveryLog,
  proactive_scan: proactiveScan,
  suggest_features: suggestFeatures,
  health_check: healthCheck,
  stream_generate: streamGenerate,
  stream_code: streamCode,
  stream_explain: streamExplain,
  get_stream_status: getStreamStatus,
  apply_smart_diff: applySmartDiff,
  multi_file_edit: multiFileEdit,
  generate_diff: generateDiff,
  revert_file: revertFile,
  import_from_figma: importFromFigma,
  import_from_figma_json: importFromFigmaJSON,
  figma_to_react: figmaToReact,
  css_to_tailwind: cssToTailwind,
  setup_expo: setupExpo,
  generate_mobile_screen: generateMobileScreen,
  build_for_platform: buildForPlatform,
  setup_eas: setupEAS,
  setup_push_notifications: setupPushNotifications,
  setup_audio_capabilities: setupAudioCapabilities,
  generate_transcription: generateTranscription,
  generate_speech: generateSpeech,
  get_rules: getRules,
  update_rules: updateRules,
  set_custom_rule: setCustomRule,
  get_agent_context: getAgentContext,
  init_rules: initRules,
  hotfix: hotfix,
  rollback_hotfix: rollbackHotfix,
  get_full_health: getFullHealth,
  get_quick_status: getQuickStatus,
  check_services_health: checkServicesHealth,
  get_system_metrics_detailed: getSystemMetricsDetailed,
  setup_snowflake: setupSnowflake,
  setup_bigquery: setupBigQuery,
  setup_databricks: setupDatabricks,
  enqueue_request: enqueueRequest,
  get_request_queue_status: getRequestQueueStatusV2,
  cancel_queued_request: cancelQueuedRequest,
  get_agent_mode_v2: getAgentModeV2,
  set_agent_mode_v2: setAgentModeV2,
  toggle_agent_feature_v2: toggleAgentFeatureV2,
  estimate_task_cost: estimateTaskCost,
  create_plan_v2: createPlanV2,
  get_plan_v2: getPlanV2,
  approve_plan_task_v2: approvePlanTaskV2,
  reject_plan_task_v2: rejectPlanTaskV2,
  modify_plan_task_v2: modifyPlanTaskV2,
  fast_exec: fastExec,
  batch_read_files: batchReadFiles,
  batch_write_files: batchWriteFiles,
  batch_check_exists: batchCheckExists,
  run_parallel_tasks: runParallelTasks,
  check_step_needed: checkStepNeeded,
  mark_step_completed: markStepCompleted,
  get_speed_stats: getSpeedStatsV2,
  clear_speed_caches: clearSpeedCaches,
  reset_step_optimizer: resetStepOptimizer,
  brain_think: brainThink,
  brain_remember_error: brainRememberError,
  brain_remember_decision: brainRememberDecision,
  brain_learn_pattern: brainLearnPattern,
  brain_set_session_goal: brainSetSessionGoal,
  brain_add_context: brainAddContext,
  brain_remember_file: brainRememberFile,
  brain_get_stats: brainGetStats,
  brain_save: brainSave,
  brain_reset: brainReset,
  self_check_full: selfCheckFull,
  self_check_quick: selfCheckQuick,
  self_check_single: selfCheckSingle,
};

export interface StepDef {
  id: number;
  type: string;
  description: string;
  details: any;
  dependsOn: number[];
  validation: string;
}

export interface ExecutionResult {
  stepId?: string;
  action?: string;
  success: boolean;
  result?: any;
  output?: string;
  error?: string;
  durationMs?: number;
  filesChanged?: string[];
}

const memory = new AgentMemory(process.env.WORKSPACE_DIR || process.env.WORKSPACE_ROOT || "/home/runner/workspace");

export async function executeStep(step: Step | StepDef): Promise<ExecutionResult> {
  const startTime = Date.now();

  if ("type" in step && "details" in step) {
    return executeStepDef(step as StepDef);
  }

  const s = step as Step;
  const handler = TOOL_MAP[s.action];

  if (!handler) {
    return {
      stepId: s.id,
      action: s.action,
      success: false,
      result: null,
      error: `Unknown tool: ${s.action}`,
      durationMs: Date.now() - startTime,
    };
  }

  try {
    const result = await handler(s.params);
    return {
      stepId: s.id,
      action: s.action,
      success: result.success !== false,
      result,
      error: result.error,
      durationMs: Date.now() - startTime,
    };
  } catch (e: any) {
    return {
      stepId: s.id,
      action: s.action,
      success: false,
      result: null,
      error: e.message,
      durationMs: Date.now() - startTime,
    };
  }
}

async function executeStepDef(step: StepDef): Promise<ExecutionResult> {
  switch (step.type) {
    case "create_file": return executeCreateFile(step);
    case "edit_file": return executeEditFile(step);
    case "run_command": return executeRunCommand(step);
    case "install_package": return executeInstallPackage(step);
    case "read_file": return executeReadFile(step);
    case "search_code": return executeSearchCode(step);
    case "create_directory": return executeCreateDirectory(step);
    case "delete_file": return executeDeleteFile(step);
    case "git_operation": return executeGitOperation(step);
    case "db_operation": return executeDbOperation(step);
    default: return executeLLMStep(step);
  }
}

async function executeCreateFile(step: StepDef): Promise<ExecutionResult> {
  const { path: filePath, content } = step.details;

  let fileContent = content;
  if (!fileContent) {
    const context = memory.getProjectContext();
    const response = await callLLM({
      system: fillPrompt(EXECUTOR_PROMPT, {
        WORKSPACE_DIR: "",
        CONTEXT: context,
        STEP: JSON.stringify(step),
      }),
      messages: [{
        role: "user",
        content: `Generate the complete file content for: ${step.description}\nFile path: ${filePath}\n\nRespond with ONLY the file content, no markdown code blocks, no explanation.`,
      }],
    });
    fileContent = extractTextContent(response.content);
    fileContent = fileContent.replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
  }

  const result = await writeFile({ path: filePath, content: fileContent });
  return {
    success: result.success,
    output: result.output || result.error || "",
    filesChanged: result.success ? [filePath] : [],
    error: result.error,
  };
}

async function executeEditFile(step: StepDef): Promise<ExecutionResult> {
  const { path: filePath, instructions, changes } = step.details;

  if (changes && Array.isArray(changes)) {
    const result = await editFile({ path: filePath, changes });
    return {
      success: result.success,
      output: result.output || "",
      filesChanged: result.success ? [filePath] : [],
      error: result.error,
    };
  }

  const readResult = await readFile({ path: filePath });
  if (!readResult.success) {
    return { success: false, output: "", filesChanged: [], error: readResult.error };
  }

  const response = await callLLM({
    system: EDIT_FILE_PROMPT,
    messages: [{
      role: "user",
      content: fillPrompt(
        "File: {{PATH}}\n\nContent:\n```\n{{CONTENT}}\n```\n\nInstructions: {{INSTRUCTIONS}}",
        {
          PATH: filePath,
          CONTENT: readResult.output || "",
          INSTRUCTIONS: instructions || step.description,
        }
      ),
    }],
  });

  const parsed = extractJSON(extractTextContent(response.content));
  if (!parsed || !parsed.changes) {
    const newContent = extractTextContent(response.content)
      .replace(/^```\w*\n/, "").replace(/\n```$/, "").trim();
    const result = await editFile({ path: filePath, changes: [{ type: "full_replace", content: newContent }] });
    return {
      success: result.success,
      output: result.output || "",
      filesChanged: result.success ? [filePath] : [],
      error: result.error,
    };
  }

  const result = await editFile({ path: filePath, changes: parsed.changes });
  return {
    success: result.success,
    output: result.output || "",
    filesChanged: result.success ? [filePath] : [],
    error: result.error,
  };
}

async function executeRunCommand(step: StepDef): Promise<ExecutionResult> {
  const { command, cwd, timeout, background } = step.details;

  if (background) {
    const bgResult = await startBackground({ id: `step-${step.id}`, command, cwd });
    await new Promise((r) => setTimeout(r, 3000));
    return {
      success: bgResult.success,
      output: `Background process started (PID: ${bgResult.pid})`,
      filesChanged: [],
    };
  }

  const result = await runCommand({ command, cwd, timeout: timeout || 60000 });
  return {
    success: result.success,
    output: result.stdout + (result.stderr ? `\nSTDERR: ${result.stderr}` : ""),
    filesChanged: [],
    error: result.success ? undefined : result.stderr || `Exit code: ${result.exitCode}`,
  };
}

async function executeInstallPackage(step: StepDef): Promise<ExecutionResult> {
  const { packages, dev } = step.details;
  const result = await installPackage({ packages, dev });
  return {
    success: result.success,
    output: result.output || "",
    filesChanged: ["package.json"],
    error: result.error,
  };
}

async function executeReadFile(step: StepDef): Promise<ExecutionResult> {
  const result = await readFile({ path: step.details.path });
  return { success: result.success, output: result.output || "", filesChanged: [], error: result.error };
}

async function executeSearchCode(step: StepDef): Promise<ExecutionResult> {
  const { query, filePattern } = step.details;
  const result = await searchCode({ pattern: query, filePattern });
  return { success: true, output: typeof result.results === "string" ? result.results : JSON.stringify(result.results), filesChanged: [] };
}

async function executeCreateDirectory(step: StepDef): Promise<ExecutionResult> {
  const result = await createDirectory({ path: step.details.path });
  return { success: result.success, output: result.output || "", filesChanged: [], error: result.error };
}

async function executeDeleteFile(step: StepDef): Promise<ExecutionResult> {
  const result = await deleteFile({ path: step.details.path });
  return { success: result.success, output: result.output || "", filesChanged: result.success ? [step.details.path] : [], error: result.error };
}

async function executeGitOperation(step: StepDef): Promise<ExecutionResult> {
  const { operation, args } = step.details;
  let result;

  switch (operation) {
    case "init": result = await gitInit(); break;
    case "add": result = await gitAdd({ files: args?.files }); break;
    case "commit": result = await gitCommit({ message: args?.message || "Auto-commit" }); break;
    case "status": result = await gitStatus(); break;
    case "log": result = await gitLog({ count: args?.count }); break;
    case "branch": result = await gitBranch({ name: args?.name }); break;
    case "checkout": result = await gitCheckout({ branch: args?.branch }); break;
    case "stash": result = await gitStash({ pop: args?.pop }); break;
    case "reset": result = await gitReset({ hard: args?.hard, target: args?.target }); break;
    default:
      return { success: false, output: "", filesChanged: [], error: `Unknown git op: ${operation}` };
  }

  return { success: result.success, output: result.output || "", filesChanged: [], error: result.error };
}

async function executeDbOperation(step: StepDef): Promise<ExecutionResult> {
  const { type, query, command } = step.details;
  let result;

  switch (type) {
    case "query":
    case "postgres": result = await dbQuery({ query }); break;
    case "drizzle_push": result = await dbDrizzlePush(); break;
    case "drizzle_generate": result = await dbDrizzleGenerate(); break;
    case "drizzle_migrate": result = await dbDrizzleMigrate(); break;
    case "seed": result = await dbSeed({ command }); break;
    case "migration": result = await dbRunMigration({ command }); break;
    default:
      return { success: false, output: "", filesChanged: [], error: `Unknown db op: ${type}` };
  }

  return { success: result.success, output: result.output || JSON.stringify(result.rows || []), filesChanged: [], error: result.error };
}

async function executeLLMStep(step: StepDef): Promise<ExecutionResult> {
  const context = memory.getProjectContext();
  const tools: ToolDef[] = getLLMToolDefinitions();

  const messages: LLMMessage[] = [{
    role: "user",
    content: `Execute this step: ${JSON.stringify(step)}\n\nUse the available tools to complete it.`,
  }];

  let allOutput = "";
  let filesChanged: string[] = [];
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    attempts++;
    const response = await callLLM({
      system: fillPrompt(EXECUTOR_PROMPT, {
        WORKSPACE_DIR: "",
        CONTEXT: context,
        STEP: JSON.stringify(step),
      }),
      messages,
      tools,
    });

    const toolCalls = response.content.filter((b) => b.type === "tool_use");
    if (toolCalls.length === 0) {
      allOutput += extractTextContent(response.content);
      break;
    }

    messages.push({ role: "assistant", content: response.content as any });

    const toolResults: any[] = [];
    for (const call of toolCalls) {
      const result = await executeTool(call.name!, call.input);
      if (result.filesChanged) filesChanged.push(...result.filesChanged);
      allOutput += (result.output || JSON.stringify(result.result || "")) + "\n";

      toolResults.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: result.output || result.error || JSON.stringify(result.result || "Done"),
        is_error: !result.success,
      });
    }

    messages.push({ role: "user", content: toolResults as any });

    if (response.stopReason === "end_turn") break;
  }

  return { success: true, output: allOutput, filesChanged };
}

function getLLMToolDefinitions(): ToolDef[] {
  return [
    { name: "create_file", description: "Create a new file with content", input_schema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } },
    { name: "read_file", description: "Read file content", input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { name: "edit_file", description: "Edit a file with search/replace changes", input_schema: { type: "object", properties: { path: { type: "string" }, changes: { type: "array", items: { type: "object", properties: { type: { type: "string", enum: ["replace", "insert_after", "insert_before", "delete", "full_replace"] }, search: { type: "string" }, replace: { type: "string" }, content: { type: "string" }, line: { type: "number" } }, required: ["type"] } } }, required: ["path", "changes"] } },
    { name: "delete_file", description: "Delete a file", input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } },
    { name: "run_command", description: "Run a shell command", input_schema: { type: "object", properties: { command: { type: "string" }, cwd: { type: "string" } }, required: ["command"] } },
    { name: "search_code", description: "Search for text in the codebase", input_schema: { type: "object", properties: { pattern: { type: "string" }, filePattern: { type: "string" } }, required: ["pattern"] } },
    { name: "list_files", description: "List directory contents", input_schema: { type: "object", properties: { path: { type: "string" }, recursive: { type: "boolean" } }, required: ["path"] } },
  ];
}

export async function executeTool(name: string, params: Record<string, any>): Promise<ExecutionResult> {
  const handler = TOOL_MAP[name];
  if (!handler) return { success: false, error: `Unknown tool: ${name}` };
  try {
    const result = await handler(params);
    return { success: result.success !== false, result, output: result.output || result.stdout, error: result.error };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export function getAvailableTools(): string[] {
  return Object.keys(TOOL_MAP);
}

export function cleanup() {
  stopAll();
}