@main def tests(): Unit =
  // 1단계: neighbours
  Judge.check("1단계 neighbours › 가운데 칸은 위·아래·왼쪽·오른쪽 순서")(
    neighbours(List("###", "###", "###"), (1, 1)),
    List((0, 1), (2, 1), (1, 0), (1, 2)))
  Judge.check("1단계 neighbours › 격자 모서리는 바깥을 제외")(
    (neighbours(List("##", "##"), (0, 0)), neighbours(List("###", "###"), (1, 2))),
    (List((1, 0), (0, 1)), List((0, 2), (1, 1))))
  Judge.check("1단계 neighbours › 물 칸과 대각선은 이웃이 아니다")(
    (neighbours(List("#.#", ".#.", "#.#"), (1, 1)), neighbours(List(".#.", "###", ".#."), (1, 1))),
    (Nil, List((0, 1), (2, 1), (1, 0), (1, 2))))

  // 2단계: region
  Judge.check("2단계 region › 땅이 아닌 칸에서 시작하면 빈 집합, 외톨이 땅은 자기 자신")(
    (region(List("#.", ".."), (1, 1)), region(List("#.", ".."), (0, 0))),
    (Set.empty[(Int, Int)], Set((0, 0))))
  Judge.check("2단계 region › 한 줄짜리 땅은 어디서 시작해도 같다")(
    (region(List("###"), (0, 0)), region(List("###"), (0, 2)), region(List("###"), (0, 1))),
    (Set((0, 0), (0, 1), (0, 2)), Set((0, 0), (0, 1), (0, 2)), Set((0, 0), (0, 1), (0, 2))))
  Judge.check("2단계 region › 갈라지는 모양(십자)")(
    region(List(".#.", "###", ".#."), (0, 1)),
    Set((0, 1), (1, 0), (1, 1), (1, 2), (2, 1)))
  Judge.check("2단계 region › 고리가 있어도 끝난다")(
    region(List("###", "#.#", "###"), (0, 0)),
    Set((0, 0), (0, 1), (0, 2), (1, 0), (1, 2), (2, 0), (2, 1), (2, 2)))
  Judge.check("2단계 region › 대각선으로만 닿은 땅은 포함하지 않는다")(
    region(List("#..", ".#.", "..#"), (1, 1)),
    Set((1, 1)))

  // 3단계: countRegions
  Judge.check("3단계 countRegions › 땅이 없으면 0")(
    (countRegions(Nil), countRegions(List("...", "..."))),
    (0, 0))
  Judge.check("3단계 countRegions › 떨어진 땅과 대각선 접촉")(
    (countRegions(List("#.#", "...", "#.#")), countRegions(List("#.", ".#"))),
    (4, 2))
  Judge.check("3단계 countRegions › 하나로 이어진 땅")(
    (countRegions(List("###", "..#", "###")), countRegions(List("###", "###", "###"))),
    (1, 1))
  Judge.check("3단계 countRegions › 가로로 긴 격자")(
    countRegions(List("#.#.##", "......")),
    3)
  Judge.check("3단계 countRegions › 세로로 긴 격자")(
    countRegions(List("#.", "#.", "..", ".#", ".#")),
    2)

  // 4단계: largestRegion
  Judge.check("4단계 largestRegion › 땅이 없으면 0")(
    (largestRegion(Nil), largestRegion(List("..", ".."))),
    (0, 0))
  Judge.check("4단계 largestRegion › 가장 큰 땅의 칸 수")(
    largestRegion(List("##.#", "#..#", "..##")),
    4)
  Judge.check("4단계 largestRegion › 오른쪽 끝에 있는 큰 땅 (가로로 긴 격자)")(
    largestRegion(List("#..#...", ".....##", "....###")),
    5)
  Judge.check("4단계 largestRegion › 위쪽에 모이지 않은 큰 땅 (세로로 긴 격자)")(
    largestRegion(List("#.", "..", "..", "#.", "##", ".#")),
    4)
