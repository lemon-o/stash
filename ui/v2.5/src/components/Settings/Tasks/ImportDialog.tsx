import React, { useState } from "react";
import { Form } from "react-bootstrap";
import { mutateImportObjects } from "src/core/StashService";
import { ModalComponent } from "src/components/Shared/Modal";
import * as GQL from "src/core/generated-graphql";
import { useToast } from "src/hooks/Toast";
import { useIntl, FormattedMessage } from "react-intl";
import { faPencilAlt } from "@fortawesome/free-solid-svg-icons";

interface IImportDialogProps {
  onClose: () => void;
}

export const ImportDialog: React.FC<IImportDialogProps> = (
  props: IImportDialogProps
) => {
  const [duplicateBehaviour, setDuplicateBehaviour] =
    useState<GQL.ImportDuplicateEnum>(GQL.ImportDuplicateEnum.Ignore);

  const [missingRefBehaviour, setMissingRefBehaviour] =
    useState<GQL.ImportMissingRefEnum>(GQL.ImportMissingRefEnum.Fail);

  const [file, setFile] = useState<File | undefined>();

  // Network state
  const [isRunning, setIsRunning] = useState(false);

  const intl = useIntl();
  const Toast = useToast();

  function duplicateHandlingToLabel(
    value: GQL.ImportDuplicateEnum | undefined
  ) {
    switch (value) {
      case GQL.ImportDuplicateEnum.Fail:
        return intl.formatMessage({ id: "fail", defaultMessage: "失败报错" });
      case GQL.ImportDuplicateEnum.Ignore:
        return intl.formatMessage({ id: "ignore", defaultMessage: "忽略跳过" });
      case GQL.ImportDuplicateEnum.Overwrite:
        return intl.formatMessage({ id: "overwrite", defaultMessage: "覆盖更新" });
    }
    return intl.formatMessage({ id: "ignore", defaultMessage: "忽略跳过" });
  }

  function missingRefHandlingToLabel(
    value: GQL.ImportMissingRefEnum | undefined
  ) {
    switch (value) {
      case GQL.ImportMissingRefEnum.Fail:
        return intl.formatMessage({ id: "fail", defaultMessage: "失败报错" });
      case GQL.ImportMissingRefEnum.Ignore:
        return intl.formatMessage({ id: "ignore", defaultMessage: "忽略跳过" });
      case GQL.ImportMissingRefEnum.Create:
        return intl.formatMessage({ id: "actions.create", defaultMessage: "自动创建" });
    }
    return intl.formatMessage({ id: "ignore", defaultMessage: "忽略跳过" });
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (
      event.target.validity.valid &&
      event.target.files &&
      event.target.files.length > 0
    ) {
      setFile(event.target.files[0]);
    }
  }

  async function onImport() {
    if (!file) return;

    try {
      setIsRunning(true);
      await mutateImportObjects({
        duplicateBehaviour,
        missingRefBehaviour,
        file,
      });
      setIsRunning(false);
      Toast.success(intl.formatMessage({ id: "toast.started_importing" }));
    } catch (e) {
      Toast.error(e);
    } finally {
      props.onClose();
    }
  }

  return (
    <ModalComponent
      show
      icon={faPencilAlt}
      header={intl.formatMessage({ id: "actions.import" })}
      accept={{
        onClick: () => {
          onImport();
        },
        text: intl.formatMessage({ id: "actions.import" }),
      }}
      cancel={{
        onClick: () => props.onClose(),
        text: intl.formatMessage({ id: "actions.cancel" }),
        variant: "secondary",
      }}
      disabled={!file}
      isRunning={isRunning}
    >
      <div className="dialog-container">
        <Form>
          <Form.Group id="import-file">
            <h6>
              <FormattedMessage
                id="import_dialog.import_zip_file"
                defaultMessage="导入 ZIP 压缩包"
              />
            </h6>
            <Form.File onChange={onFileChange} accept=".zip" />
          </Form.Group>
          <Form.Group id="duplicate-handling">
            <h6>
              <FormattedMessage
                id="import_dialog.duplicate_handling"
                defaultMessage="重复对象处理方式"
              />
            </h6>
            <Form.Control
              className="w-auto input-control"
              as="select"
              value={duplicateBehaviour}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setDuplicateBehaviour(e.currentTarget.value as GQL.ImportDuplicateEnum)
              }
            >
              {Object.values(GQL.ImportDuplicateEnum).map((p) => (
                <option key={p} value={p}>{duplicateHandlingToLabel(p)}</option>
              ))}
            </Form.Control>
          </Form.Group>

          <Form.Group id="missing-ref-handling">
            <h6>
              <FormattedMessage
                id="import_dialog.missing_ref_handling"
                defaultMessage="缺失引用对象处理方式"
              />
            </h6>
            <Form.Control
              className="w-auto input-control"
              as="select"
              value={missingRefBehaviour}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setMissingRefBehaviour(e.currentTarget.value as GQL.ImportMissingRefEnum)
              }
            >
              {Object.values(GQL.ImportMissingRefEnum).map((p) => (
                <option key={p} value={p}>{missingRefHandlingToLabel(p)}</option>
              ))}
            </Form.Control>
          </Form.Group>
        </Form>
      </div>
    </ModalComponent>
  );
};
