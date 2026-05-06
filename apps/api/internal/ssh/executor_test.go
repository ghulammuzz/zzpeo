package ssh

import "testing"

func TestBuildFullCmd(t *testing.T) {
	cases := []struct {
		name      string
		workdir   string
		runAsUser string
		cmd       string
		want      string
	}{
		{
			name:      "no run_as_user",
			workdir:   "/var/www/app",
			runAsUser: "",
			cmd:       "git pull origin main",
			want:      "cd /var/www/app && git pull origin main",
		},
		{
			name:      "with run_as_user",
			workdir:   "/var/www/shortie",
			runAsUser: "shortie",
			cmd:       "git pull origin main",
			want:      "su - shortie -c 'cd /var/www/shortie && git pull origin main'",
		},
		{
			name:      "with run_as_user and pm2 restart",
			workdir:   "/var/www/app",
			runAsUser: "shortie",
			cmd:       "pm2 restart my-app",
			want:      "su - shortie -c 'cd /var/www/app && pm2 restart my-app'",
		},
		{
			name:      "cmd with single quote is escaped",
			workdir:   "/var/www/app",
			runAsUser: "deploy",
			cmd:       "echo 'hello world'",
			want:      `su - deploy -c 'cd /var/www/app && echo '\''hello world'\'''`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := buildFullCmd(tc.workdir, tc.runAsUser, tc.cmd)
			if got != tc.want {
				t.Errorf("\ngot:  %s\nwant: %s", got, tc.want)
			}
		})
	}
}
