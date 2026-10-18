import React, { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import {
  getClient,
  mutateConfigureGeneral,
  mutateMetadataScan,
  useConfigureUI,
} from "src/core/StashService";
import { LoadingIndicator } from "../Shared/LoadingIndicator";
import { Button } from "react-bootstrap";
import { FrontPageConfig } from "./FrontPageConfig";
import { useToast } from "src/hooks/Toast";
import { Control } from "./Control";
import { useConfigurationContext } from "src/hooks/Config";
import {
  FrontPageContent,
  generateDefaultFrontPageContent,
  getFrontPageContent,
} from "src/core/config";
import { useScrollToTopOnMount } from "src/hooks/scrollToTop";
import { PatchComponent } from "src/patch";
import { FolderSelectDialog } from "../Shared/FolderSelect/FolderSelectDialog";
import { Icon } from "../Shared/Icon";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import TextUtils from "src/utils/text";
import { useHistory } from "react-router-dom";
import { runAutoGroupIfAvailable } from "src/core/StashService";
import { ContinueWatchingRow } from "./ContinueWatchingRow";
import { FrontPageSearchBar } from "./FrontPageSearchBar";

const FrontPage: React.FC = PatchComponent("FrontPage", () => {
  const history = useHistory();
  const intl = useIntl();
  const Toast = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [isAddingDirectory, setIsAddingDirectory] = useState(false);
  const [saving, setSaving] = useState(false);

  const [saveUI] = useConfigureUI();

  const { configuration } = useConfigurationContext();
  const stashes = configuration?.general?.stashes ?? [];
  const hasDirectories = stashes.length > 0;

  useScrollToTopOnMount();

  async function onUpdateConfig(content?: FrontPageContent[]) {
    setIsEditing(false);

    if (!content) {
      return;
    }

    setSaving(true);
    try {
      await saveUI({
        variables: {
          input: {
            ...configuration?.ui,
            frontPageContent: content,
          },
        },
      });
    } catch (e) {
      Toast.error(e);
    }
    setSaving(false);
  }

  if (saving) {
    return <LoadingIndicator />;
  }

  if (isEditing) {
    return <FrontPageConfig onClose={(content) => onUpdateConfig(content)} />;
  }

  if (!hasDirectories) {
    return (
      <div className="empty-front-page-container">
        <Button
          variant="primary"
          size="lg"
          className="empty-front-page-add-btn"
          onClick={() => setIsAddingDirectory(true)}
        >
          <Icon icon={faPlus} className="mr-2" />
          <FormattedMessage id="actions.add_directory" />
        </Button>

        {isAddingDirectory && (
          <FolderSelectDialog
            onClose={async (v) => {
              if (v) {
                const cleanPath = TextUtils.stripQuotes(v);
                const newStashItem = {
                  path: cleanPath,
                  excludeVideo: false,
                  excludeImage: false,
                };
                const newStashes = [...stashes, newStashItem];

                try {
                  await mutateConfigureGeneral({
                    stashes: newStashes.map((s) => ({
                      path: s.path,
                      excludeVideo: s.excludeVideo,
                      excludeImage: s.excludeImage,
                    })),
                  });
                  await mutateMetadataScan({
                    paths: [cleanPath],
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
                  // 立即跳转至任务队列界面
                  history.push("/settings?tab=tasks");
                } catch (err) {
                  console.error("Add directory and scan failed:", err);
                  Toast.error(err);
                }
              }
              setIsAddingDirectory(false);
            }}
          />
        )}
      </div>
    );
  }

  const ui = configuration?.ui ?? {};

  if (!ui.frontPageContent) {
    const defaultContent = generateDefaultFrontPageContent(intl);
    onUpdateConfig(defaultContent);
  }

  const frontPageContent = getFrontPageContent(ui);

  const recIndex =
    frontPageContent?.findIndex(
      (c) =>
        c.__typename === "CustomFilter" &&
        (c.message?.id === "recommendations" || c.sortBy === "recommended")
    ) ?? -1;

  return (
    <div className="recommendations-container">
      <FrontPageSearchBar />
      <div>
        {(!frontPageContent || frontPageContent.length === 0) && (
          <ContinueWatchingRow />
        )}
        {frontPageContent?.map((content, i) => {
          const showContinueWatchingBefore =
            recIndex !== -1 ? i === recIndex : i === 0;

          return (
            <React.Fragment key={i}>
              {showContinueWatchingBefore && <ContinueWatchingRow />}
              <Control content={content} />
            </React.Fragment>
          );
        })}
      </div>
      <div className="recommendations-footer">
        <Button onClick={() => setIsEditing(true)}>
          <FormattedMessage id={"actions.customise"} />
        </Button>
      </div>
    </div>
  );
});

export default FrontPage;
