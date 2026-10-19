import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  faEye,
  faEyeSlash,
} from "@fortawesome/free-solid-svg-icons";

interface IAccountUser {
  id: number;
  username: string;
  is_admin: boolean;
  password_hash?: string;
  created_at?: string;
}

const STORAGE_KEY_USERS = "stash_user_accounts";
const STORAGE_KEY_CURRENT_USER = "stash_current_user";

async function sha256(str: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function syncUsersToBackend(usersList: IAccountUser[]): Promise<void> {
  try {
    await fetch("/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `mutation SyncUsers($plugin_id: ID!, $args: Map) {
          runPluginOperation(plugin_id: $plugin_id, args: $args)
        }`,
        variables: {
          plugin_id: "multi_user",
          args: {
            action: "save_users",
            users: usersList,
          },
        },
      }),
    });
  } catch (e) {
    console.error("Failed to sync users to backend:", e);
  }
}

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

const PasswordInput: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
}> = ({ value, onChange, placeholder, required }) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="position-relative d-flex align-items-center">
      <Form.Control
        type={showPassword ? "text" : "password"}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value)
        }
        style={{ paddingRight: "40px" }}
      />
      <button
        type="button"
        className="btn btn-link position-absolute p-0 d-flex align-items-center justify-content-center"
        style={{
          right: "12px",
          top: 0,
          bottom: 0,
          zIndex: 5,
          color: showPassword ? "#ffffff" : "#888888",
          boxShadow: "none",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          transition: "color 0.15s ease",
        }}
        onClick={() => setShowPassword(!showPassword)}
        title={showPassword ? "隐藏密码" : "查看密码"}
      >
        <Icon icon={showPassword ? faEyeSlash : faEye} />
      </button>
    </div>
  );
};

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
    let userList: IAccountUser[] = [];

    // 1. Fetch authoritative users from /assets/users.json
    try {
      const res = await fetch("/assets/users.json?t=" + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.users)) {
          userList = data.users;
        }
      }
    } catch {}

    // 2. If network fetch failed, fall back to local storage
    if (userList.length === 0) {
      userList = getLocalUsers();
    } else {
      saveLocalUsers(userList);
    }

    // 3. If still empty, check if general.username is set in config.yml
    if (userList.length === 0 && general.username) {
      userList = [
        {
          id: 1,
          username: general.username,
          is_admin: true,
          created_at: new Date().toISOString(),
        },
      ];
    }

    setUsers(userList);

    // 4. Resolve current user (preserve member session)
    let cur = getLocalCurrentUser();
    if (!cur) {
      cur = userList.find((u) => u.is_admin) || userList[0] || null;
    } else {
      const matched = userList.find(
        (u) => u.username.toLowerCase() === cur?.username.toLowerCase()
      );
      if (matched) {
        cur = { ...cur, ...matched };
      }
    }
    saveLocalCurrentUser(cur);
    setCurrentUser(cur);

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
      if (
        users.some(
          (u) => u.username.toLowerCase() === uname.toLowerCase()
        )
      ) {
        Toast.error(`用户名 "${uname}" 已存在，请更换`);
        setIsCreating(false);
        return;
      }

      const isFirstAdmin = users.length === 0;

      // 1. If this is the first account (Admin), also save into config.yml
      if (isFirstAdmin) {
        await saveGeneral({ username: uname, password: newPassword });
      }

      // 2. Call backend REST API to create user in SQLite
      let createdUser: IAccountUser = {
        id: isFirstAdmin ? 1 : Date.now(),
        username: uname,
        is_admin: isFirstAdmin,
        created_at: new Date().toISOString(),
      };

      try {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: uname, password: newPassword }),
        });
        if (
          res.ok &&
          res.headers.get("content-type")?.includes("application/json")
        ) {
          const data = await res.json();
          if (data && data.id) {
            createdUser = data;
          }
        }
      } catch {}

      const updatedList = [...users, createdUser];
      saveLocalUsers(updatedList);
      setUsers(updatedList);

      if (isFirstAdmin) {
        setCurrentUser(createdUser);
        saveLocalCurrentUser(createdUser);
        Toast.success(`成功创建管理员账号: ${uname}`);
      } else {
        Toast.success(`成功创建成员账号: ${uname}`);
      }

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
    const isPrimaryAdmin =
      user.id === 1 ||
      user.is_admin ||
      (general.username && user.username === general.username);

    if (isPrimaryAdmin) {
      Toast.error("管理员账号不可删除");
      return;
    }

    if (
      !window.confirm(
        `确定要删除成员账号 "${user.username}" 吗？该账号的所有独立观看记录将被清除。`
      )
    ) {
      return;
    }

    try {
      // 1. Call backend REST API to permanently delete from SQLite database
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || "后端删除失败");
      }

      // 2. Update local state and local storage
      const remainingList = users.filter(
        (u) => u.id !== user.id && u.username !== user.username
      );
      saveLocalUsers(remainingList);
      setUsers(remainingList);

      if (currentUser?.username === user.username) {
        const fallback = remainingList[0] ?? null;
        setCurrentUser(fallback);
        saveLocalCurrentUser(fallback);
      }

      Toast.success(`成员账号 ${user.username} 已成功删除`);
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

    const isTargetAdmin =
      selectedUserForPassword.id === 1 ||
      selectedUserForPassword.is_admin ||
      (general.username &&
        selectedUserForPassword.username.toLowerCase() ===
          general.username.toLowerCase());

    // 核心安全校验：普通成员绝无权限修改管理员密码
    if (isTargetAdmin && !isCurrentAdmin) {
      Toast.error("普通成员无权修改管理员密码");
      return;
    }

    // 普通成员仅允许修改自己的密码
    if (
      !isCurrentAdmin &&
      currentUser?.username?.toLowerCase() !==
        selectedUserForPassword.username.toLowerCase()
    ) {
      Toast.error("普通成员无权修改其他账号密码");
      return;
    }

    setIsChangingPassword(true);
    try {
      // 仅当目标是管理员且当前操作者是管理员时，才同步更新系统全局配置 config.yml
      if (isTargetAdmin && isCurrentAdmin) {
        await saveGeneral({ password: changePassword });
      }

      // 同步更新 SQLite 数据库用户表
      const res = await fetch(
        `/api/users/${selectedUserForPassword.id}/password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: changePassword }),
        }
      );
      if (!res.ok) {
        const errText = await res.text();
        if (!isTargetAdmin) {
          throw new Error(errText || "后端修改密码失败");
        }
      }

      Toast.success(
        `已成功更新账号 ${selectedUserForPassword.username} 的密码`
      );
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

  const isCurrentAdmin = Boolean(
    currentUser?.is_admin === true ||
    (currentUser?.username &&
      general.username &&
      currentUser.username.toLowerCase() === general.username.toLowerCase() &&
      currentUser.username.toLowerCase() !== "test")
  );

  // 普通账户登陆后，不要显示其他所有账号，只需要管理自己的账号即可
  const displayUsers = useMemo(() => {
    if (isCurrentAdmin) {
      return users;
    }
    const currentName = currentUser?.username?.toLowerCase() || "test";
    const self = users.filter(
      (u) => u.username.toLowerCase() === currentName
    );
    if (self.length > 0) return self;
    return [
      {
        id: currentUser?.id || 1792392421569,
        username: currentUser?.username || "test",
        is_admin: false,
      },
    ];
  }, [users, isCurrentAdmin, currentUser]);

  return (
    <SettingSection headingID="config.general.auth.authentication">
      {/* 1. 多账号管理与凭证面板 */}
      <div className="content border-bottom" id="user-accounts-setting">
        <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap">
          <div>
            <h3>
              {isCurrentAdmin ? (
                <FormattedMessage
                  id="config.general.auth.multi_user_heading"
                  defaultMessage="账号凭证与多用户管理"
                />
              ) : (
                "个人账号凭证"
              )}
            </h3>
            <div className="sub-heading text-muted mt-1">
              {isCurrentAdmin ? (
                <FormattedMessage
                  id="config.general.auth.multi_user_desc"
                  defaultMessage="支持多账号独立登录，各账号的观看记录与断点进度相互隔离。首个账号为管理员，仅管理员可新建并管理成员账号。"
                />
              ) : (
                "当前账号的登录凭据与密码安全设置。"
              )}
            </div>
          </div>
          <div className="mt-2 mt-sm-0">
            {isCurrentAdmin && (
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
            )}
          </div>
        </div>

        {loadingUsers ? (
          <div className="py-4 text-center">
            <LoadingIndicator />
          </div>
        ) : displayUsers.length === 0 ? (
          <div
            className="text-center text-muted py-4 rounded"
            style={{
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              border: "1px dashed rgba(255, 255, 255, 0.12)",
            }}
          >
            {isCurrentAdmin
              ? "暂无账号，点击右上角「+ 新建账号」创建首个管理员账号"
              : "未检测到当前账号信息"}
          </div>
        ) : (
          <div className="user-accounts-list d-flex flex-column" style={{ gap: "10px" }}>
            {displayUsers.map((u) => {
              const isPrimaryAdmin =
                u.id === 1 ||
                u.is_admin ||
                !!(
                  general.username &&
                  u.username.toLowerCase() === general.username.toLowerCase()
                );
              const isSelf = !!(
                currentUser?.username &&
                u.username.toLowerCase() === currentUser.username.toLowerCase()
              );
              // 核心权限隔离：管理员可修改任何账号密码；普通成员仅可修改自身密码，绝不可修改管理员密码
              const canChangePassword =
                isCurrentAdmin || (!isPrimaryAdmin && isSelf);
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
                    {canChangePassword && (
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
                    )}

                    {isCurrentAdmin && !isPrimaryAdmin && (
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

      {/* 2. API 密钥设置 (仅管理员可见) */}
      {isCurrentAdmin && (
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
            <Button
              variant="danger"
              onClick={() => onClearAPIKey()}
            >
              {intl.formatMessage({
                id: "config.general.auth.clear_api_key",
                defaultMessage: "清除",
              })}
            </Button>
          </div>
        </div>
      )}

      {/* 3. 最大会话有效期设置 (仅管理员可见) */}
      {isCurrentAdmin && (
        <NumberSetting
          id="maxSessionAge"
          headingID="config.general.auth.maximum_session_age"
          subHeadingID="config.general.auth.maximum_session_age_desc"
          value={general.maxSessionAge ?? undefined}
          onChange={(v) => saveGeneral({ maxSessionAge: v })}
        />
      )}

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
              <PasswordInput
                required
                placeholder={
                  users.length === 0
                    ? "请输入管理员密码"
                    : "请输入新账号密码"
                }
                value={newPassword}
                onChange={setNewPassword}
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
              <PasswordInput
                required
                placeholder="请输入新密码"
                value={changePassword}
                onChange={setChangePassword}
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
