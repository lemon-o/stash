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

const STORAGE_KEY_USERS = "stash_user_accounts";
const STORAGE_KEY_CURRENT_USER = "stash_current_user";

function getLocalUsers(): IAccountUser[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USERS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveLocalUsers(list: IAccountUser[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(list));
  } catch {}
}

function getLocalCurrentUser(): IAccountUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveLocalCurrentUser(u: IAccountUser | null): void {
  try {
    if (u) {
      localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(u));
    } else {
      localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
    }
  } catch {}
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
    let localList = getLocalUsers();

    // If general.username exists (from config.yml), ensure admin user is present
    if (general.username) {
      const existingAdmin = localList.find((u) => u.id === 1 || u.is_admin);
      if (!existingAdmin) {
        const defaultAdmin: IAccountUser = {
          id: 1,
          username: general.username,
          is_admin: true,
          created_at: new Date().toISOString(),
        };
        localList = [defaultAdmin, ...localList.filter((u) => u.id !== 1)];
        saveLocalUsers(localList);
      } else if (existingAdmin.username !== general.username) {
        existingAdmin.username = general.username;
        saveLocalUsers(localList);
      }
    }

    setUsers(localList);

    let cur = getLocalCurrentUser();
    if (!cur || !localList.some((u) => u.id === cur?.id)) {
      cur = localList[0] ?? null;
      saveLocalCurrentUser(cur);
    }
    setCurrentUser(cur);

    // Optional API check if backend is running multi-user
    try {
      const listRes = await fetch("/api/users");
      const ct = listRes.headers.get("content-type");
      if (listRes.ok && ct && ct.includes("application/json")) {
        const listData = await listRes.json();
        if (Array.isArray(listData) && listData.length > 0) {
          setUsers(listData);
          saveLocalUsers(listData);
        }
      }
    } catch {}

    setLoadingUsers(false);
  }, [general.username]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    const uname = newUsername.trim();
    if (!uname || !newPassword) {
      Toast.error("用户名和密码不能为空");
      return;
    }

    setIsCreating(true);
    try {
      const localList = getLocalUsers();
      if (
        localList.some(
          (u) => u.username.toLowerCase() === uname.toLowerCase()
        )
      ) {
        Toast.error(`用户名 "${uname}" 已存在，请更换`);
        setIsCreating(false);
        return;
      }

      const isFirstAdmin = localList.length === 0 && !general.username;
      const newUser: IAccountUser = {
        id: isFirstAdmin ? 1 : Date.now(),
        username: uname,
        is_admin: isFirstAdmin,
        created_at: new Date().toISOString(),
      };

      const updatedList = [...localList, newUser];
      saveLocalUsers(updatedList);
      setUsers(updatedList);

      // If this is the admin (first account), sync with Stash native config.yml
      if (isFirstAdmin) {
        await saveGeneral({
          username: uname,
          password: newPassword,
        });
        setCurrentUser(newUser);
        saveLocalCurrentUser(newUser);
        Toast.success(
          `成功创建管理员账号: ${uname}（已同步配置后台凭证）`
        );
      } else {
        Toast.success(`成功创建成员账号: ${uname}`);
      }

      // Also try API in case backend is supported
      try {
        await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: uname,
            password: newPassword,
          }),
        });
      } catch {}

      setNewUsername("");
      setNewPassword("");
      setShowCreateModal(false);
    } catch (err: any) {
      Toast.error(err.message || "创建账号异常");
    } finally {
      setIsCreating(false);
    }
  }

  function handleSwitchUser(user: IAccountUser) {
    setCurrentUser(user);
    saveLocalCurrentUser(user);
    Toast.success(`已切换至账号: ${user.username}`);
  }

  async function handleDeleteUser(user: IAccountUser) {
    if (user.id === 1 || user.is_admin) {
      Toast.error("不可删除管理员默认账号");
      return;
    }

    if (
      !window.confirm(
        `确定要删除账号 "${user.username}" 吗？该账号的所有独立观看记录将被清除。`
      )
    ) {
      return;
    }

    try {
      const localList = getLocalUsers().filter((u) => u.id !== user.id);
      saveLocalUsers(localList);
      setUsers(localList);
      if (currentUser?.id === user.id) {
        const fallback = localList[0] ?? null;
        setCurrentUser(fallback);
        saveLocalCurrentUser(fallback);
      }

      Toast.success(`账号 ${user.username} 已成功删除`);

      try {
        await fetch(`/api/users/${user.id}`, {
          method: "DELETE",
        });
      } catch {}
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
      // If user 1 (admin), also update general settings for config.yml sync
      if (
        selectedUserForPassword.id === 1 ||
        selectedUserForPassword.is_admin
      ) {
        await saveGeneral({
          username: selectedUserForPassword.username,
          password: changePassword,
        });
      }

      Toast.success(
        `已成功更新账号 ${selectedUserForPassword.username} 的密码`
      );
      setChangePassword("");
      setShowPasswordModal(false);

      try {
        await fetch(
          `/api/users/${selectedUserForPassword.id}/password`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password: changePassword }),
          }
        );
      } catch {}
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

  const isCurrentAdmin =
    users.length === 0 ||
    currentUser?.is_admin ||
    users[0]?.id === currentUser?.id;

  return (
    <SettingSection headingID="config.general.auth.authentication">
      {/* 1. 多账号管理与凭证面板 */}
      <div className="content border-bottom" id="user-accounts-setting">
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
                defaultMessage="支持多账号独立登录，各账号的观看记录与断点进度相互隔离。首个账号为管理员，仅管理员可新建并管理成员账号。"
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
          <div className="py-4 text-center">
            <LoadingIndicator />
          </div>
        ) : users.length === 0 ? (
          <div
            className="text-center text-muted py-4 rounded"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              border: "1px dashed rgba(255, 255, 255, 0.12)",
            }}
          >
            暂无账号，点击右上角「+ 新建账号」创建首个管理员账号
          </div>
        ) : (
          <div className="user-accounts-list d-flex flex-column" style={{ gap: "10px" }}>
            {users.map((u) => {
              const isPrimaryAdmin = u.id === 1 || u.is_admin;
              const isCurrent = currentUser?.username === u.username;
              return (
                <div
                  key={u.id}
                  className="user-account-item d-flex justify-content-between align-items-center p-3 rounded"
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {/* Left: User Avatar + Name + Badges */}
                  <div
                    className="d-flex align-items-center flex-wrap"
                    style={{ gap: "12px", minWidth: 0 }}
                  >
                    <span
                      className="user-avatar-circle d-inline-flex align-items-center justify-content-center"
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        backgroundColor: isPrimaryAdmin
                          ? "rgba(46, 204, 113, 0.16)"
                          : "rgba(149, 165, 166, 0.16)",
                        color: isPrimaryAdmin ? "#2ecc71" : "#bdc3c7",
                        fontSize: "16px",
                        flexShrink: 0,
                      }}
                    >
                      <Icon icon={isPrimaryAdmin ? faUserShield : faUser} />
                    </span>

                    <span
                      className="font-weight-bold text-truncate"
                      style={{ fontSize: "1.05rem", color: "#f5f8fa" }}
                    >
                      {u.username}
                    </span>

                    {isPrimaryAdmin && (
                      <Badge
                        variant="success"
                        className="px-2 py-1 font-weight-normal"
                        style={{ fontSize: "0.8rem" }}
                      >
                        管理员
                      </Badge>
                    )}
                  </div>

                  {/* Right: Actions */}
                  <div
                    className="d-inline-flex align-items-center flex-shrink-0 ml-3"
                    style={{ gap: "8px" }}
                  >
                    <Button
                      variant="outline-light"
                      size="sm"
                      onClick={() => {
                        setSelectedUserForPassword(u);
                        setChangePassword("");
                        setShowPasswordModal(true);
                      }}
                    >
                      <Icon icon={faKey} className="mr-1" />
                      修改密码
                    </Button>

                    {isCurrentAdmin && u.id !== 1 && !u.is_admin && (
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => handleDeleteUser(u)}
                        title="删除此账号"
                      >
                        <Icon icon={faTrash} className="mr-1" />
                        删除
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
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
              defaultMessage: "生成",
            })}
          </Button>
          <Button variant="danger" onClick={() => onClearAPIKey()}>
            {intl.formatMessage({
              id: "config.general.auth.clear_api_key",
              defaultMessage: "清除",
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
            {users.length === 0 ? "新建管理员账号" : "新建成员账号"}
          </Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleCreateUser}>
          <Modal.Body>
            <Form.Group>
              <Form.Label>用户名</Form.Label>
              <Form.Control
                type="text"
                required
                placeholder={
                  users.length === 0
                    ? "请输入管理员用户名"
                    : "请输入新用户名"
                }
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
                placeholder={
                  users.length === 0
                    ? "请输入管理员密码"
                    : "请输入新账号密码"
                }
                value={newPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewPassword(e.target.value)
                }
              />
              <Form.Text className="text-muted mt-2">
                {users.length === 0
                  ? "创建首个账号，该账号将自动设为系统管理员，并同步配置为系统后台认证凭证。"
                  : "新建的账号为普通成员账号，拥有独立的观看记录与断点进度。普通账号无权创建新账号。"}
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
