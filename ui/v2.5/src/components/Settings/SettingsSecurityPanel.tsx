import React, { useCallback, useEffect, useState } from "react";
import { NumberSetting } from "./Inputs";
import { SettingSection } from "./SettingSection";
import { Button, Form, Modal, Badge, Table } from "react-bootstrap";
import { useIntl, FormattedMessage } from "react-intl";
import { useSettings } from "./context";
import { LoadingIndicator } from "../Shared/LoadingIndicator";
import { useToast } from "src/hooks/Toast";
import { useGenerateAPIKey } from "src/core/StashService";
import { Icon } from "../Shared/Icon";
import {
  faUserShield,
  faUser,
  faPlus,
  faTrash,
  faKey,
} from "@fortawesome/free-solid-svg-icons";

interface IAccountUser {
  id: number;
  username: string;
  is_admin: boolean;
  created_at?: string;
}

export const SettingsSecurityPanel: React.FC = () => {
  const intl = useIntl();
  const Toast = useToast();

  const { general, apiKey, loading, error, saveGeneral, refetch } =
    useSettings();

  const [generateAPIKey] = useGenerateAPIKey();

  // Multi-user state
  const [currentUser, setCurrentUser] = useState<IAccountUser | null>(null);
  const [users, setUsers] = useState<IAccountUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUserForPassword, setSelectedUserForPassword] =
    useState<IAccountUser | null>(null);
  const [changePassword, setChangePassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const curRes = await fetch("/api/users/current");
      if (curRes.ok) {
        const curData = await curRes.json();
        setCurrentUser(curData);
      }
      const listRes = await fetch("/api/users");
      if (listRes.ok) {
        const listData = await listRes.json();
        setUsers(listData);
        setLoadingUsers(false);
        return;
      }
    } catch (e) {
      // Ignore API errors and fallback to settings
    }

    if (general.username) {
      const defaultUser: IAccountUser = {
        id: 1,
        username: general.username,
        is_admin: true,
      };
      setUsers([defaultUser]);
      setCurrentUser(defaultUser);
    }
    setLoadingUsers(false);
  }, [general.username]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword) {
      Toast.error("用户名和密码不能为空");
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword,
        }),
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "创建账号失败");
      }

      Toast.success(`成功创建成员账号: ${newUsername.trim()}`);
      setNewUsername("");
      setNewPassword("");
      setShowCreateModal(false);
      await fetchUsers();
    } catch (err: any) {
      Toast.error(err.message || "创建账号异常");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeleteUser(user: IAccountUser) {
    if (user.id === 1) {
      Toast.error("不可删除超级管理员默认账号");
      return;
    }

    if (!window.confirm(`确定要删除账号 "${user.username}" 吗？该账号的所有独立观看记录将被清除。`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "删除账号失败");
      }

      Toast.success(`账号 ${user.username} 已成功删除`);
      await fetchUsers();
    } catch (err: any) {
      Toast.error(err.message || "删除账号异常");
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUserForPassword || !changePassword) {
      Toast.error("密码不能为空");
      return;
    }

    setIsChangingPassword(true);
    try {
      const res = await fetch(
        `/api/users/${selectedUserForPassword.id}/password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: changePassword }),
        }
      );

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "修改密码失败");
      }

      // If user 1, also update general settings for config.yml sync
      if (selectedUserForPassword.id === 1) {
        saveGeneral({
          username: selectedUserForPassword.username,
          password: changePassword,
        });
      }

      Toast.success(`已成功更新账号 ${selectedUserForPassword.username} 的密码`);
      setChangePassword("");
      setShowPasswordModal(false);
    } catch (err: any) {
      Toast.error(err.message || "修改密码异常");
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function onGenerateAPIKey() {
    try {
      await generateAPIKey({
        variables: {
          input: {},
        },
      });
      refetch();
    } catch (e: any) {
      Toast.error(e);
    }
  }

  async function onClearAPIKey() {
    try {
      await generateAPIKey({
        variables: {
          input: {
            clear: true,
          },
        },
      });
      refetch();
    } catch (e: any) {
      Toast.error(e);
    }
  }

  if (error) return <h1>{error.message}</h1>;
  if (loading) return <LoadingIndicator />;

  const isCurrentAdmin = currentUser?.is_admin ?? (users[0]?.id === currentUser?.id);

  return (
    <SettingSection headingID="config.general.auth.authentication">
      {/* 1. 多账号管理与凭证面板 */}
      <div className="setting flex-column align-items-stretch" id="user-accounts-setting">
        <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap">
          <div>
            <h3>
              <FormattedMessage
                id="config.general.auth.multi_user_heading"
                defaultMessage="账号凭证与多用户管理"
              />
            </h3>
            <div className="sub-heading text-muted mt-1">
              <FormattedMessage
                id="config.general.auth.multi_user_desc"
                defaultMessage="支持多账号独立登录，各账号的观看记录与断点进度相互隔离。首个账号为超级管理员，仅管理员可新建并管理成员账号。"
              />
            </div>
          </div>
          <div className="mt-2 mt-sm-0">
            {isCurrentAdmin ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCreateModal(true)}
                className="d-inline-flex align-items-center"
              >
                <Icon icon={faPlus} className="mr-1" />
                <FormattedMessage
                  id="config.general.auth.create_user"
                  defaultMessage="新建账号"
                />
              </Button>
            ) : (
              <span className="badge badge-secondary p-2">
                <FormattedMessage
                  id="config.general.auth.non_admin_hint"
                  defaultMessage="普通账号（受限无权创建新账号）"
                />
              </span>
            )}
          </div>
        </div>

        {loadingUsers ? (
          <div className="py-3 text-center">
            <LoadingIndicator />
          </div>
        ) : (
          <div className="table-responsive">
            <Table hover variant="dark" className="user-management-table mb-0">
              <thead>
                <tr>
                  <th style={{ width: "40%" }}>账号名称</th>
                  <th style={{ width: "35%" }}>角色身份</th>
                  <th className="text-right" style={{ width: "25%" }}>
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isPrimaryAdmin = u.id === 1 || u.is_admin;
                  const isCurrent = currentUser?.username === u.username;
                  return (
                    <tr key={u.id}>
                      <td className="align-middle font-weight-bold">
                        <span className="user-avatar-badge mr-2">
                          <Icon icon={isPrimaryAdmin ? faUserShield : faUser} />
                        </span>
                        {u.username}
                        {isCurrent && (
                          <Badge variant="info" className="ml-2 font-weight-normal">
                            当前在线
                          </Badge>
                        )}
                      </td>
                      <td className="align-middle">
                        {isPrimaryAdmin ? (
                          <Badge variant="success" className="p-1 px-2 font-weight-normal">
                            超级管理员 (默认首账号)
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="p-1 px-2 font-weight-normal">
                            普通成员 (记录独立)
                          </Badge>
                        )}
                      </td>
                      <td className="align-middle text-right">
                        {(isCurrentAdmin || isCurrent) && (
                          <Button
                            variant="outline-secondary"
                            size="sm"
                            className="mr-2"
                            onClick={() => {
                              setSelectedUserForPassword(u);
                              setChangePassword("");
                              setShowPasswordModal(true);
                            }}
                          >
                            <Icon icon={faKey} className="mr-1" />
                            修改密码
                          </Button>
                        )}

                        {isCurrentAdmin && u.id !== 1 && (
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleDeleteUser(u)}
                          >
                            <Icon icon={faTrash} className="mr-1" />
                            删除
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )}
      </div>

      {/* 2. API 密钥设置 */}
      <div className="setting" id="apikey">
        <div>
          <h3>{intl.formatMessage({ id: "config.general.auth.api_key" })}</h3>

          <div className="value text-break">{apiKey}</div>

          <div className="sub-heading">
            {intl.formatMessage({ id: "config.general.auth.api_key_desc" })}
          </div>
        </div>
        <div>
          <Button
            disabled={!general.username || !general.password}
            onClick={() => onGenerateAPIKey()}
          >
            {intl.formatMessage({
              id: "config.general.auth.generate_api_key",
            })}
          </Button>
          <Button variant="danger" onClick={() => onClearAPIKey()}>
            {intl.formatMessage({
              id: "config.general.auth.clear_api_key",
            })}
          </Button>
        </div>
      </div>

      {/* 3. 最大会话有效期设置 */}
      <NumberSetting
        id="maxSessionAge"
        headingID="config.general.auth.maximum_session_age"
        subHeadingID="config.general.auth.maximum_session_age_desc"
        value={general.maxSessionAge ?? undefined}
        onChange={(v) => saveGeneral({ maxSessionAge: v })}
      />

      {/* 模态框：新建账号 */}
      <Modal
        show={showCreateModal}
        onHide={() => setShowCreateModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <FormattedMessage
              id="config.general.auth.modal_create_title"
              defaultMessage="新建成员账号"
            />
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleCreateUser}>
          <Modal.Body>
            <Form.Group>
              <Form.Label>用户名</Form.Label>
              <Form.Control
                type="text"
                required
                placeholder="请输入新用户名"
                value={newUsername}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewUsername(e.target.value)
                }
              />
            </Form.Group>
            <Form.Group>
              <Form.Label>登录密码</Form.Label>
              <Form.Control
                type="password"
                required
                placeholder="请输入新账号密码"
                value={newPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewPassword(e.target.value)
                }
              />
              <Form.Text className="text-muted mt-2">
                新建的账号为普通成员账号，拥有独立的观看记录与断点进度。普通账号无权创建新账号。
              </Form.Text>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowCreateModal(false)}
            >
              取消
            </Button>
            <Button variant="primary" type="submit" disabled={isCreating}>
              {isCreating ? "创建中..." : "确认创建"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* 模态框：修改密码 */}
      <Modal
        show={showPasswordModal}
        onHide={() => setShowPasswordModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            修改密码 - {selectedUserForPassword?.username}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleChangePassword}>
          <Modal.Body>
            <Form.Group>
              <Form.Label>新密码</Form.Label>
              <Form.Control
                type="password"
                required
                placeholder="请输入新密码"
                value={changePassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setChangePassword(e.target.value)
                }
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowPasswordModal(false)}
            >
              取消
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={isChangingPassword}
            >
              {isChangingPassword ? "保存中..." : "保存新密码"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </SettingSection>
  );
};
