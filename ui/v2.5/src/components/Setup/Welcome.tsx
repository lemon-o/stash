import React, { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import { Alert, Button, Card, Container, Form } from "react-bootstrap";
import * as GQL from "src/core/generated-graphql";
import {
  mutateMetadataScan,
  runAutoGroupIfAvailable,
  useConfigureUI,
  useSystemStatus,
} from "src/core/StashService";
import { useHistory, useLocation } from "react-router-dom";
import { useConfigurationContext } from "src/hooks/Config";
import { Icon } from "../Shared/Icon";
import { LoadingIndicator } from "../Shared/LoadingIndicator";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { releaseNotes } from "src/docs/en/ReleaseNotes";
import { ExternalLink } from "../Shared/ExternalLink";
import { useToast } from "src/hooks/Toast";

const DiscordLink = (
  <ExternalLink href="https://discord.gg/2TsNFKt">Discord</ExternalLink>
);
const GithubLink = (
  <ExternalLink href="https://github.com/stashapp/stash/issues">
    <FormattedMessage id="setup.github_repository" />
  </ExternalLink>
);

const SuccessStep: React.FC<{
  configuration: GQL.ConfigDataFragment;
  systemStatus: GQL.SystemStatusQuery;
}> = ({ configuration, systemStatus }) => {
  const intl = useIntl();
  const history = useHistory();
  const location = useLocation<{
    hasAddedDirectories?: boolean;
    stashes?: GQL.StashConfigInput[];
  }>();
  const Toast = useToast();

  const [mutateDownloadFFMpeg] = GQL.useDownloadFfMpegMutation();
  const [saveUI] = useConfigureUI();

  const [downloadFFmpeg, setDownloadFFmpeg] = useState(true);
  const [isFinishing, setIsFinishing] = useState(false);

  const status = systemStatus?.systemStatus;

  const contextStashes = configuration?.general?.stashes ?? [];
  const stateStashes = location.state?.stashes ?? [];
  const effectiveStashes =
    contextStashes.length > 0 ? contextStashes : stateStashes;
  const hasDirectories =
    location.state?.hasAddedDirectories || effectiveStashes.length > 0;

  async function markReleaseNotesSeen() {
    try {
      // Set lastNoteSeen to hide release notes dialog
      await saveUI({
        variables: {
          input: {
            ...configuration?.ui,
            lastNoteSeen: releaseNotes[0].date,
          },
        },
      });
    } catch (_e) {
      // ignore
    }
  }

  async function onFinishClick() {
    setIsFinishing(true);
    try {
      await markReleaseNotesSeen();

      if ((!status?.ffmpegPath || !status?.ffprobePath) && downloadFFmpeg) {
        try {
          await mutateDownloadFFMpeg();
        } catch (e) {
          console.error("Download ffmpeg failed:", e);
        }
      }

      if (hasDirectories) {
        try {
          const scanPaths =
            effectiveStashes.length > 0
              ? effectiveStashes.map((s) => s.path)
              : undefined;

          await mutateMetadataScan({
            paths: scanPaths,
            scanGenerateCovers: true,
            scanGeneratePreviews: true,
            scanGenerateSprites: false,
            scanGenerateThumbnails: true,
          });
          await runAutoGroupIfAvailable();
          Toast.success(
            intl.formatMessage(
              { id: "config.tasks.added_job_to_queue" },
              {
                operation_name: intl.formatMessage({
                  id: "actions.scan",
                }),
              }
            )
          );
        } catch (err) {
          console.error("Auto scan failed:", err);
          Toast.error(err);
        }
        // 自动触发扫描后，立即跳转至任务队列界面实时查看进度
        history.replace("/settings?tab=tasks");
      } else {
        history.replace("/settings?tab=library");
      }
    } finally {
      setIsFinishing(false);
    }
  }

  return (
    <>
      <section>
        <h2>
          <FormattedMessage id="setup.success.your_system_has_been_created" />
        </h2>
        {hasDirectories ? (
          <p className="lead">
            <FormattedMessage
              id="setup.success.auto_scan_notice"
              defaultMessage="媒体目录已配置完成。点击下方按钮后，系统将自动开始为您扫描媒体库，并立即跳转至任务队列实时查看扫描进度。"
            />
          </p>
        ) : (
          <>
            <p>
              <FormattedMessage id="setup.success.next_config_step_one" />
            </p>
            <p>
              <FormattedMessage
                id="setup.success.next_config_step_two"
                values={{
                  code: (chunks: string) => <code>{chunks}</code>,
                  localized_task: intl.formatMessage({
                    id: "config.categories.tasks",
                  }),
                  localized_scan: intl.formatMessage({ id: "actions.scan" }),
                }}
              />
            </p>
          </>
        )}
        {!status?.ffmpegPath || !status?.ffprobePath ? (
          <>
            <Alert variant="warning text-center">
              <FormattedMessage
                id="setup.success.missing_ffmpeg"
                values={{
                  code: (chunks: string) => <code>{chunks}</code>,
                }}
              />
            </Alert>
            <p>
              <Form.Check
                id="download-ffmpeg"
                checked={downloadFFmpeg}
                label={intl.formatMessage({
                  id: "setup.success.download_ffmpeg",
                })}
                onChange={() => setDownloadFFmpeg(!downloadFFmpeg)}
              />
            </p>
          </>
        ) : null}
      </section>
      <section>
        <h3>
          <FormattedMessage id="setup.success.getting_help" />
        </h3>
        <p>
          <FormattedMessage
            id="setup.success.in_app_manual_explained"
            values={{ icon: <Icon icon={faQuestionCircle} /> }}
          />
        </p>
        <p>
          <FormattedMessage
            id="setup.success.help_links"
            values={{ discordLink: DiscordLink, githubLink: GithubLink }}
          />
        </p>
      </section>
      <section>
        <h3>
          <FormattedMessage id="setup.success.support_us" />
        </h3>
        <p>
          <FormattedMessage
            id="setup.success.open_collective"
            values={{
              open_collective_link: (
                <ExternalLink href="https://opencollective.com/stashapp">
                  Open Collective
                </ExternalLink>
              ),
            }}
          />
        </p>
        <p>
          <FormattedMessage id="setup.success.welcome_contrib" />
        </p>
      </section>
      <section>
        <p className="lead text-center">
          <FormattedMessage id="setup.success.thanks_for_trying_stash" />
        </p>
      </section>
      <section className="mt-5">
        <div className="d-flex justify-content-center">
          <Button
            variant="success mx-2 p-5"
            disabled={isFinishing}
            onClick={() => onFinishClick()}
          >
            <FormattedMessage
              id={
                hasDirectories
                  ? "setup.success.finish_and_scan"
                  : "actions.finish"
              }
              defaultMessage={hasDirectories ? "完成并开始扫描" : "完成"}
            />
          </Button>
        </div>
      </section>
    </>
  );
};

export const Welcome: React.FC = () => {
  const { configuration } = useConfigurationContext();

  const {
    data: systemStatus,
    loading: statusLoading,
    error: statusError,
  } = useSystemStatus();

  if (statusLoading) {
    return <LoadingIndicator />;
  }

  if (statusError) {
    return (
      <Container>
        <Alert variant="danger">
          <FormattedMessage
            id="setup.errors.unable_to_retrieve_system_status"
            values={{ error: statusError.message }}
          />
        </Alert>
      </Container>
    );
  }

  if (!configuration || !systemStatus) {
    return (
      <Container>
        <Alert variant="danger">
          <FormattedMessage
            id="setup.errors.unable_to_retrieve_configuration"
            values={{ error: "configuration or systemStatus === undefined" }}
          />
        </Alert>
      </Container>
    );
  }

  return (
    <Container className="setup-wizard">
      <h1 className="text-center">
        <FormattedMessage id="setup.stash_setup_wizard" />
      </h1>
      <Card>
        <SuccessStep
          systemStatus={systemStatus}
          configuration={configuration}
        />
      </Card>
    </Container>
  );
};

export default Welcome;
