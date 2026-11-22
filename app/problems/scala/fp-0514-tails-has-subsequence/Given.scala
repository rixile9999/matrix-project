import Stream.{Cons, Empty}

enum Stream[+A]:
  case Empty
  case Cons(h: () => A, t: () => Stream[A])

object Stream:
  def cons[A](hd: => A, tl: => Stream[A]): Stream[A] =
    lazy val head = hd
    lazy val tail = tl
    Cons(() => head, () => tail)

  def empty[A]: Stream[A] = Empty

  def apply[A](as: A*): Stream[A] =
    if as.isEmpty then empty else cons(as.head, apply(as.tail*))

extension [A](s: Stream[A])
  def toList: List[A] =
    @annotation.tailrec
    def go(cur: Stream[A], acc: List[A]): List[A] = cur match
      case Cons(h, t) => go(t(), h() :: acc)
      case Empty => acc.reverse
    go(s, Nil)

extension [A](s: Stream[A])
  def take(n: Int): Stream[A] = s match
    case Cons(h, t) if n > 1 => Stream.cons(h(), t().take(n - 1))
    case Cons(h, _) if n == 1 => Stream.cons(h(), Stream.empty)
    case _ => Stream.empty

extension [A](s: Stream[A])
  def foldRight[B](z: => B)(f: (A, => B) => B): B = s match
    case Cons(h, t) => f(h(), t().foldRight(z)(f))
    case Empty => z

extension [A](s: Stream[A])
  def exists(p: A => Boolean): Boolean =
    s.foldRight(false)((a, b) => p(a) || b)

extension [A](s: Stream[A])
  def append[B >: A](s2: => Stream[B]): Stream[B] =
    s.foldRight(s2)((a, b) => Stream.cons(a, b))

def unfold[A, S](z: S)(f: S => Option[(A, S)]): Stream[A] =
  f(z) match
    case Some((a, s)) => Stream.cons(a, unfold(s)(f))
    case None => Stream.empty

extension [A](s: Stream[A])
  def startsWith(prefix: Stream[A]): Boolean = (s, prefix) match
    case (_, Empty) => true
    case (Cons(h1, t1), Cons(h2, t2)) if h1() == h2() => t1().startsWith(t2())
    case _ => false
