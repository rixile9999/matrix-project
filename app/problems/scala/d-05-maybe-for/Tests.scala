import Maybe.*

def half(n: Int): Maybe[Int] = if n % 2 == 0 then Just(n / 2) else Empty

@main def tests(): Unit =
  Judge.check("생성기 하나")(for a <- Just(4) yield a + 1, Just(5))
  Judge.check("생성기 둘")(
    for a <- Just(2); b <- Just(3) yield a * b,
    Just(6))
  Judge.check("중간이 Empty면 전체가 Empty")(
    for a <- half(8); b <- half(a); c <- half(b) yield c,
    Just(1))
  Judge.check("Empty 전파")(
    for a <- half(6); b <- half(a) yield b,
    Empty)
  Judge.check("가드 통과")(
    for a <- Just(10) if a > 5 yield a,
    Just(10))
  Judge.check("가드 탈락")(
    for a <- Just(3); b <- Just(4) if a > b yield a - b,
    Empty)
