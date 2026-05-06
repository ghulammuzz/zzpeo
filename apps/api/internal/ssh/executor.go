package ssh

import (
	"bufio"
	"context"
	"fmt"
	"strings"

	gossh "golang.org/x/crypto/ssh"
)

// Executor runs shell commands on a remote host via an established SSH Client.
type Executor struct {
	client *Client
}

// NewExecutor wraps c in an Executor.
func NewExecutor(c *Client) *Executor {
	return &Executor{client: c}
}

// RunCommands executes commands sequentially inside workdir.
// Each line of stdout/stderr is sent to output as it arrives.
// Execution stops and an error is returned if any command exits non-zero.
//
// If runAsUser is non-empty, each command is wrapped with:
//
//	su - <runAsUser> -c '<cmd>'
//
// so that the command runs as that Linux user rather than the SSH login user.
func (e *Executor) RunCommands(
	ctx context.Context,
	workdir string,
	runAsUser string,
	commands []string,
	output chan<- string,
) error {
	for _, cmd := range commands {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		session, err := e.client.sshClient.NewSession()
		if err != nil {
			return fmt.Errorf("new session: %w", err)
		}

		fullCmd := buildFullCmd(workdir, runAsUser, cmd)

		stdout, err := session.StdoutPipe()
		if err != nil {
			session.Close()
			return err
		}
		stderr, err := session.StderrPipe()
		if err != nil {
			session.Close()
			return err
		}

		// done receives one signal per scanner goroutine when it exits.
		done := make(chan struct{}, 2)

		scanLines := func(r interface{ Read([]byte) (int, error) }) {
			scanner := bufio.NewScanner(r)
			for scanner.Scan() {
				select {
				case output <- scanner.Text():
				case <-ctx.Done():
					done <- struct{}{}
					return
				}
			}
			done <- struct{}{}
		}

		go scanLines(stdout)
		go scanLines(stderr)

		if err := session.Start(fullCmd); err != nil {
			session.Close()
			return fmt.Errorf("start command [%s]: %w", cmd, err)
		}

		// Wait for both scanners to drain before calling session.Wait.
		<-done
		<-done

		waitErr := session.Wait()
		session.Close()

		if waitErr != nil {
			if exitErr, ok := waitErr.(*gossh.ExitError); ok {
				return fmt.Errorf("command [%s] exited with status %d", cmd, exitErr.ExitStatus())
			}
			// ExitMissingError: SSH connection dropped before exit status arrived.
			// Usually caused by NAT/firewall timeout during a long-running command.
			if _, ok := waitErr.(*gossh.ExitMissingError); ok {
				return fmt.Errorf("SSH connection dropped during command [%s] — connection timed out while waiting for result. Try again; if it persists check server SSH keepalive settings", cmd)
			}
			return fmt.Errorf("command failed [%s]: %w", cmd, waitErr)
		}
	}
	return nil
}

// buildFullCmd constructs the shell command to run on the remote host.
//
// Without runAsUser:
//
//	cd /workdir && <cmd>
//
// With runAsUser (e.g. "shortie"):
//
//	su - shortie -c 'cd /workdir && <cmd>'
//
// Single-quotes inside cmd are escaped via the '\'\” idiom so they survive
// being passed as the -c argument.
func buildFullCmd(workdir, runAsUser, cmd string) string {
	base := fmt.Sprintf("cd %s && %s", workdir, cmd)
	if runAsUser == "" {
		return base
	}
	// Escape single-quotes in base so it's safe inside '...'.
	escaped := strings.ReplaceAll(base, "'", `'\''`)
	return fmt.Sprintf("su - %s -c '%s'", runAsUser, escaped)
}
